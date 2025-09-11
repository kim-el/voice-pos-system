class POSCashier {
    constructor() {
        this.items = [];
        this.salesHistory = [];
        this.totalSales = 0;
        this.totalOrders = 0;
        this.paidAmount = 0;
        this.isVoiceRecording = false;
        
        // WebSocket for receiving orders from voice app
        this.webSocket = null;
        this.connectToWebSocket();
        
        this.updateDisplay();
        this.initVoice();
    }
    
    connectToWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.webSocket = new WebSocket(`${protocol}//${window.location.host}`);
            
            this.webSocket.onopen = () => {
                console.log('POS connected to WebSocket');
                this.updateConnectionStatus(true);
            };
            
            this.webSocket.onmessage = (event) => {
                try {
                    console.log('=== POS RECEIVED MESSAGE ===');
                    console.log('Raw event data:', event.data);
                    const message = JSON.parse(event.data);
                    console.log('Parsed message:', message);
                    
                    if (message.type === 'ADD_ITEM') {
                        const { name, price, quantity } = message.data;
                        console.log('Adding item to POS:', name, price, quantity);
                        this.addItem(name, price, quantity);
                        this.showOrderNotification(name, quantity);
                        console.log('✅ Item added successfully');
                    } else {
                        console.log('Unknown message type:', message.type);
                    }
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error);
                }
            };
            
            this.webSocket.onclose = () => {
                console.log('POS WebSocket disconnected, attempting to reconnect...');
                this.updateConnectionStatus(false);
                setTimeout(() => this.connectToWebSocket(), 3000);
            };
            
            this.webSocket.onerror = (error) => {
                console.error('POS WebSocket error:', error);
                this.updateConnectionStatus(false);
            };
        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.updateConnectionStatus(false);
        }
    }
    
    updateConnectionStatus(isConnected) {
        const statusElement = document.querySelector('.connection-dot');
        const statusText = document.querySelector('.header-info span');
        
        if (statusElement) {
            statusElement.style.backgroundColor = isConnected ? '#10b981' : '#ef4444';
        }
        
        if (statusText) {
            statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
        }
    }
    
    showOrderNotification(itemName, quantity) {
        // Create and show a notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #10b981, #059669);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            z-index: 1000;
            font-weight: bold;
            animation: slideIn 0.3s ease-out;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>🛒</span>
                <span>Added: ${quantity}x ${itemName}</span>
            </div>
        `;
        
        // Add animation keyframes
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Voice functionality
    async initVoice() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.apiKey = config.apiKey;
            
            if (this.apiKey && this.apiKey !== 'your_api_key_here') {
                console.log('Voice control ready');
            } else {
                console.warn('API key not configured');
            }
        } catch (error) {
            console.error('Failed to load voice config:', error);
        }
    }

    async startVoiceRecording() {
        if (!this.apiKey || this.apiKey === 'your_api_key_here') {
            alert('Please configure Google API key first');
            return;
        }

        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            this.source = this.audioContext.createMediaStreamSource(this.audioStream);
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            // Simple voice recognition simulation
            this.processor.onaudioprocess = (event) => {
                // In a real implementation, this would process audio and send to Gemini API
                // For now, just show recording state
            };
            
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.isVoiceRecording = true;
            this.updateVoiceButton();
            
            // Simulate voice commands after 3 seconds
            setTimeout(() => {
                this.simulateVoiceCommand();
            }, 3000);
            
        } catch (error) {
            console.error('Voice recording failed:', error);
            alert('Microphone access denied or not available');
        }
    }

    stopVoiceRecording() {
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        if (this.processor) {
            this.processor.disconnect();
        }
        if (this.source) {
            this.source.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.isVoiceRecording = false;
        this.updateVoiceButton();
    }

    simulateVoiceCommand() {
        // Simulate random voice commands
        const commands = [
            { name: 'Coffee', price: 4.50, quantity: 1 },
            { name: 'Burger', price: 12.99, quantity: 1 },
            { name: 'Fries', price: 5.50, quantity: 2 },
            { name: 'Soda', price: 2.99, quantity: 1 }
        ];
        
        const command = commands[Math.floor(Math.random() * commands.length)];
        this.addItem(command.name, command.price, command.quantity);
        this.stopVoiceRecording();
    }

    updateVoiceButton() {
        const btn = document.getElementById('voiceBtn');
        if (this.isVoiceRecording) {
            btn.textContent = '⏹️ Stop';
            btn.classList.add('recording');
        } else {
            btn.textContent = '🎤 Start';
            btn.classList.remove('recording');
        }
    }

    // Item management
    addItem(name, price, quantity = 1) {
        const existingItem = this.items.find(item => item.name === name);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.items.push({
                id: Date.now() + Math.random(),
                name,
                price,
                quantity
            });
        }
        
        this.updateDisplay();
    }

    removeItem(id) {
        this.items = this.items.filter(item => item.id !== id);
        this.updateDisplay();
    }

    updateQuantity(id, newQuantity) {
        if (newQuantity <= 0) {
            this.removeItem(id);
            return;
        }
        
        const item = this.items.find(item => item.id === id);
        if (item) {
            item.quantity = newQuantity;
            this.updateDisplay();
        }
    }

    clearAll() {
        this.items = [];
        this.paidAmount = 0;
        this.updateDisplay();
    }

    // Payment calculations
    addToPayment(digit) {
        this.paidAmount = this.paidAmount * 10 + parseInt(digit);
        this.updateDisplay();
    }

    clearPayment() {
        this.paidAmount = 0;
        this.updateDisplay();
    }

    getTotal() {
        return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    getChange() {
        return Math.max(0, this.paidAmount - this.getTotal());
    }

    // Sales completion
    async completeSale() {
        const total = this.getTotal();
        if (total <= 0 || this.items.length === 0) {
            alert('Cannot complete empty sale');
            return;
        }
        
        if (this.paidAmount < total) {
            alert('Insufficient payment');
            return;
        }

        try {
            // Save to database via API
            console.log('💾 Saving sale to database...');
            const response = await fetch('/api/complete-sale', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items: this.items,
                    total: total
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Sale saved to database:', result);
            
            // Add to local sales history
            const sale = {
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                }),
                items: [...this.items],
                amount: total
            };
            
            this.salesHistory.unshift(sale);
            this.totalSales += total;
            this.totalOrders += 1;
            
            // Calculate change
            const change = this.paidAmount > total ? this.paidAmount - total : 0;
            
            // Clear current sale
            this.items = [];
            this.paidAmount = 0;
            
            this.updateDisplay();
            
            // Show completion message
            if (change > 0) {
                alert(`Sale completed! Change: $${change.toFixed(2)}`);
            } else {
                alert('Sale completed!');
            }
        } catch (error) {
            console.error('❌ Error saving sale:', error);
            alert('Error saving sale to database. Please try again.');
        }
    }

    // Display updates
    updateDisplay() {
        this.updateItemsList();
        this.updateTotals();
        this.updateCalculator();
        this.updateSalesHistory();
        this.updateHeader();
    }

    updateItemsList() {
        const itemsList = document.getElementById('itemsList');
        let emptyState = document.getElementById('emptyState');
        
        if (this.items.length === 0) {
            // Create empty state if it doesn't exist
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'emptyState';
                emptyState.className = 'empty-state';
                emptyState.innerHTML = '<p>No items added yet</p><p style="font-size: 0.875rem; margin-top: 0.25rem;">Use voice commands or manual entry</p>';
            }
            emptyState.style.display = 'flex';
            itemsList.innerHTML = '';
            itemsList.appendChild(emptyState);
            return;
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        itemsList.innerHTML = '';
        
        this.items.forEach(item => {
            const itemRow = document.createElement('div');
            itemRow.className = 'item-row';
            itemRow.onclick = () => this.removeItem(item.id);
            
            itemRow.innerHTML = `
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-price">$${item.price.toFixed(2)} each</div>
                </div>
                <div class="item-controls">
                    <button class="quantity-btn minus" onclick="event.stopPropagation(); posSystem.updateQuantity(${item.id}, ${item.quantity - 1})">−</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn plus" onclick="event.stopPropagation(); posSystem.updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
                    <div class="item-total">$${(item.price * item.quantity).toFixed(2)}</div>
                    <div style="color: #ef4444; margin-left: 0.5rem; font-weight: bold;">×</div>
                </div>
            `;
            
            itemsList.appendChild(itemRow);
        });
    }

    updateTotals() {
        const total = this.getTotal();
        document.getElementById('totalAmount').textContent = `$${total.toFixed(2)}`;
        
        const completeSaleBtn = document.getElementById('completeSaleBtn');
        completeSaleBtn.disabled = total <= 0;
    }

    updateCalculator() {
        const total = this.getTotal();
        const change = this.getChange();
        
        document.getElementById('calcAmount').textContent = total.toFixed(2);
        document.getElementById('paidAmount').textContent = this.paidAmount.toFixed(2);
        document.getElementById('changeAmount').textContent = change.toFixed(2);
    }

    updateSalesHistory() {
        const historyList = document.getElementById('historyList');
        
        if (this.salesHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <p style="font-size: 0.875rem;">No sales yet today</p>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = '';
        
        this.salesHistory.forEach(sale => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            historyItem.innerHTML = `
                <div>
                    <div style="color: #d1d5db;">${sale.timestamp}</div>
                    <div style="font-size: 0.75rem; color: #9ca3af;">${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</div>
                </div>
                <div style="font-weight: 600; color: #10b981;">$${sale.amount.toFixed(2)}</div>
            `;
            
            historyList.appendChild(historyItem);
        });
    }

    updateHeader() {
        document.getElementById('totalSales').textContent = this.totalSales.toFixed(2);
        document.getElementById('totalOrders').textContent = this.totalOrders.toString();
        document.getElementById('dailyTotal').textContent = `$${this.totalSales.toFixed(2)}`;
    }

    // Manual item addition
    showAddItemForm() {
        document.getElementById('addItemForm').classList.add('show');
    }

    hideAddItemForm() {
        document.getElementById('addItemForm').classList.remove('show');
        document.getElementById('itemName').value = '';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemQuantity').value = '1';
    }

    addCustomItem() {
        const name = document.getElementById('itemName').value.trim();
        const price = parseFloat(document.getElementById('itemPrice').value);
        const quantity = parseInt(document.getElementById('itemQuantity').value) || 1;
        
        if (!name || isNaN(price) || price <= 0) {
            alert('Please enter valid item name and price');
            return;
        }
        
        this.addItem(name, price, quantity);
        this.hideAddItemForm();
    }
}

// Global functions for HTML onclick handlers
function toggleVoice() {
    if (posSystem.isVoiceRecording) {
        posSystem.stopVoiceRecording();
    } else {
        posSystem.startVoiceRecording();
    }
}

function clearAll() {
    if (confirm('Clear all items?')) {
        posSystem.clearAll();
    }
}

function addToPayment(digit) {
    posSystem.addToPayment(digit);
}

function clearPayment() {
    posSystem.clearPayment();
}

function completeSale() {
    posSystem.completeSale();
}

function toggleAddForm() {
    posSystem.showAddItemForm();
}

function cancelAddItem() {
    posSystem.hideAddItemForm();
}

function addCustomItem() {
    posSystem.addCustomItem();
}

function testAddItem() {
    console.log('🧪 TEST: Adding test item to POS');
    posSystem.addItem('Test Pizza', 15.99, 2);
    alert('Test item added! Check if it appears in the items list.');
}

// Initialize POS system
let posSystem;
document.addEventListener('DOMContentLoaded', () => {
    posSystem = new POSCashier();
    console.log('🚀 POS System initialized');
});