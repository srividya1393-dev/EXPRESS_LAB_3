require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let db;

const initializeServer = async () => {
    db = await open({
        filename: path.join(__dirname, "books.db"),
        driver: sqlite3.Database,
    });

    // table lekapote books.sql nundi create chesi data pedutundi
    const tableExists = await db.get(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'book'"
    );
    if (!tableExists) {
        const sql = fs.readFileSync(path.join(__dirname, "books.sql"), "utf8");
        await db.exec(sql);
        console.log("books.sql loaded");
    }

    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
};
initializeServer();

const isEmpty = (v) => v === undefined || v === null || v === "";

const validateBook = ({ title, author, price, pages } = {}) => {
    if (!title || !String(title).trim()) return "title is required";
    if (!author || !String(author).trim()) return "author is required";
    if (isEmpty(price) || isNaN(Number(price))) return "price must be a number";
    if (!isEmpty(pages) && isNaN(Number(pages))) return "pages must be a number";
    return null;
};

const toPages = (p) => (isEmpty(p) ? null : Number(p));

app.get("/books", async (req, res) => {
    const {
        search_q = "",
        order_by = "id",
        order = "ASC",
        limit = 10,
        offset = 0,
        min_price = 0,
        max_price = 1000000,
    } = req.query;

    const allowedCols = ["id", "title", "author", "price", "pages"];
    if (!allowedCols.includes(order_by))
        return res.status(400).json({ message: "order_by must be one of id, title, author, price, pages" });
    if (!["ASC", "DESC"].includes(order.toUpperCase()))
        return res.status(400).json({ message: "order must be ASC or DESC" });
    if ([limit, offset, min_price, max_price].some((v) => isNaN(Number(v))))
        return res.status(400).json({ message: "limit, offset, min_price and max_price must be numbers" });

    const books = await db.all(
        `SELECT * FROM book
     WHERE title LIKE ? AND price BETWEEN ? AND ?
     ORDER BY ${order_by} ${order.toUpperCase()}
     LIMIT ? OFFSET ?`,
        [`%${search_q}%`, Number(min_price), Number(max_price), Number(limit), Number(offset)]
    );
    res.status(200).json(books);
});

app.get("/books/:id", async (req, res) => {
    const book = await db.get("SELECT * FROM book WHERE id = ?", [req.params.id]);
    if (!book) return res.status(404).json({ message: "Book not found" });
    res.status(200).json(book);
});

app.post("/books", async (req, res) => {
    const error = validateBook(req.body);
    if (error) return res.status(400).json({ message: error });
    const { title, author, price, pages } = req.body;
    const result = await db.run(
        "INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?)",
        [title, author, Number(price), toPages(pages)]
    );
    res.status(201).json({ message: "Book created", id: result.lastID });
});

app.put("/books/:id", async (req, res) => {
    const error = validateBook(req.body);
    if (error) return res.status(400).json({ message: error });
    const existing = await db.get("SELECT id FROM book WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ message: "Book not found" });
    const { title, author, price, pages } = req.body;
    await db.run(
        "UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?",
        [title, author, Number(price), toPages(pages), req.params.id]
    );
    res.status(200).json({ message: "Book updated" });
});

app.delete("/books/:id", async (req, res) => {
    const existing = await db.get("SELECT id FROM book WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ message: "Book not found" });
    await db.run("DELETE FROM book WHERE id = ?", [req.params.id]);
    res.status(200).json({ message: "Book deleted" });
});