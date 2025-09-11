const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Initialize SQLite database
const db = new sqlite3.Database('orders.db');

// Create orders table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        total_price REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    clients.add(ws);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);
            
            // Broadcast to all other connected clients
            clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
        clients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        apiKey: process.env.GOOGLE_API_KEY || 'your_api_key_here'
    });
});

// Save completed sale to database
app.post('/api/complete-sale', (req, res) => {
    const { items, total } = req.body;
    console.log('💾 Saving completed sale to database:', { items, total });
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No items provided for sale' });
    }
    
    const savedItems = [];
    let completed = 0;
    
    items.forEach(item => {
        db.run(
            'INSERT INTO orders (item_name, quantity, price, total_price) VALUES (?, ?, ?, ?)',
            [item.name, item.quantity, item.price, item.quantity * item.price],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return;
                }
                
                const savedItem = {
                    id: this.lastID,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    totalPrice: item.quantity * item.price
                };
                savedItems.push(savedItem);
                
                completed++;
                if (completed === items.length) {
                    console.log(`✅ Sale completed: ${items.length} items saved to database`);
                    res.json({ 
                        message: `Sale completed: ${items.length} items saved`,
                        items: savedItems,
                        total: total
                    });
                }
            }
        );
    });
});

// Get all orders
app.get('/api/orders', (req, res) => {
    db.all('SELECT * FROM orders ORDER BY timestamp DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/POS2/Cashier', (req, res) => {
    res.sendFile(path.join(__dirname, 'cashier.html'));
});

server.listen(port, () => {
    console.log(`🎤 Voice to Text + POS Server running at http://localhost:${port}`);
    console.log('📱 Voice App: http://localhost:3000');
    console.log('🏪 POS Cashier: http://localhost:3000/POS2/Cashier');
    console.log('🔌 WebSocket server ready for real-time communication');
});