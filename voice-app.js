class SimpleVoiceToText {
    constructor() {
        this.ws = null;
        this.audioStream = null;
        this.isConnected = false;
        this.isRecording = false;
        this.apiKey = null;
        this.model = 'models/gemini-2.0-flash-live-001';
        this.endpoint = null;
        this.sampleRate = 16000;
        
        // WebSocket for POS communication
        this.posWebSocket = null;
        this.connectToPOS();
        
        // Debouncing for order processing
        this.orderProcessingTimeout = null;
        this.fullTranscription = '';
        
        this.initializeElements();
        this.loadConfig();
    }
    
    connectToPOS() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.posWebSocket = new WebSocket(`${protocol}//${window.location.host}`);
            
            this.posWebSocket.onopen = () => {
                console.log('Connected to POS WebSocket');
            };
            
            this.posWebSocket.onclose = () => {
                console.log('POS WebSocket disconnected, attempting to reconnect...');
                setTimeout(() => this.connectToPOS(), 3000);
            };
            
            this.posWebSocket.onerror = (error) => {
                console.error('POS WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to POS WebSocket:', error);
        }
    }
    
    async processCompleteOrder(transcription) {
        // Process individual items as they appear
        console.log('🔍 Checking for new items to process...');
        
        console.log('🚀 Processing complete order:', transcription);
        console.log('📤 Sending directly to POS via WebSocket...');
        
        try {
            // Extract JSON from markdown code block - get the LAST complete JSON block
            let jsonString = transcription;
            if (transcription.includes('```json')) {
                // Find all complete JSON blocks
                const jsonMatches = [...transcription.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
                if (jsonMatches.length > 0) {
                    // Use the last (most recent) complete JSON block
                    jsonString = jsonMatches[jsonMatches.length - 1][1];
                    console.log(`📋 Extracted JSON block ${jsonMatches.length} of ${jsonMatches.length}:`, jsonString);
                }
            }
            
            // Clean up the JSON string (fix common formatting issues)
            jsonString = jsonString
                .replace(/(\d)\s+(\.\d+)/g, '$1$2')  // Fix "2 .50" -> "2.50"
                .replace(/(\d)\s+(\.\d+)/g, '$1$2')  // Fix "3 .00" -> "3.00" (run twice for safety)
                .replace(/}\s*,\s*]/g, '}]')          // Fix "}, ]" -> "}]"
                .replace(/,\s*}/g, '}');             // Fix ", }" -> "}"
            
            console.log('🧹 Cleaned JSON:', jsonString);
            
            // Parse the JSON response from transcription
            let jsonOrder;
            try {
                jsonOrder = JSON.parse(jsonString);
                console.log('✅ Parsed JSON from transcription:', jsonOrder);
                
                // Convert base_price to price and clean up item names
                if (jsonOrder.items) {
                    jsonOrder.items = jsonOrder.items.map(item => ({
                        name: item.name.replace(/\s+/g, ' ').trim(), // Fix multiple/extra spaces
                        quantity: item.quantity,
                        price: item.base_price || item.price
                    }));
                    console.log('🔄 Converted to standard format:', jsonOrder);
                }
            } catch (error) {
                console.error('❌ Failed to parse JSON from transcription:', error);
                console.log('📝 Raw transcription:', transcription);
                return;
            }
            
            // Send JSON directly to POS via WebSocket
            if (this.posWebSocket && this.posWebSocket.readyState === WebSocket.OPEN) {
                jsonOrder.items.forEach(item => {
                    const message = {
                        type: 'ADD_ITEM',
                        data: {
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity
                        }
                    };
                    console.log('📤 Sending to POS via WebSocket:', message);
                    this.posWebSocket.send(JSON.stringify(message));
                });
                
                console.log(`✅ Successfully sent ${jsonOrder.items.length} items to POS`);
                // Clear transcription to prevent reprocessing
                this.clearTranscription();
                this.fullTranscription = '';
                this.orderProcessed = false; // Reset for next order
            } else {
                console.error('❌ WebSocket not connected to POS');
            }
        } catch (error) {
            console.error('❌ Error processing order:', error);
        }
    }
    
    extractMenuFromPrompt(prompt) {
        console.log('Extracting menu from prompt:', prompt);
        const menuItems = {};
        const lines = prompt.split('\n');
        
        lines.forEach(line => {
            console.log('Processing line:', line);
            // Match patterns for Malaysian menu format: "- Teh ais: RM3.00"
            // Also match: "Item Name - $price", "Item Name: $price", "Item Name $price"
            const menuMatch = line.match(/^-?\s*([^-:$]+?)[\s\-:]*(?:RM|rm|\$)?(\d+\.?\d*)/);
            if (menuMatch) {
                let itemName = menuMatch[1].trim();
                const price = parseFloat(menuMatch[2]);
                
                // Skip lines that are clearly not menu items
                if (itemName.includes('Example') || itemName.includes('#') || itemName.includes('*') || 
                    itemName.length < 2 || itemName.includes('Subtotal') || itemName.includes('Total')) {
                    return;
                }
                
                console.log('Found menu item:', itemName, 'price:', price);
                
                if (itemName && !isNaN(price) && price > 0) {
                    // Create keywords from the item name
                    const keywords = itemName.toLowerCase().split(/\s+/);
                    menuItems[itemName.toLowerCase()] = {
                        name: itemName,
                        price: price,
                        keywords: keywords
                    };
                }
            }
        });
        
        console.log('Final menu items:', menuItems);
        return menuItems;
    }

    parseOrderFromText(text) {
        const orders = [];
        console.log('Parsing order text:', text);
        
        // Check if this is a structured Gemini response (contains "- Item, Quantity, RM")
        if (text.includes('RM') && text.includes('each')) {
            console.log('Detected structured Gemini response, parsing...');
            return this.parseStructuredResponse(text);
        }
        
        // Otherwise, parse as raw voice input
        const lowerText = text.toLowerCase();
        
        // Get menu from prompt
        const promptText = this.promptInput ? this.promptInput.value : '';
        const menuItems = this.extractMenuFromPrompt(promptText);
        
        if (Object.keys(menuItems).length === 0) {
            console.log('No menu items found in prompt');
            return orders;
        }
        
        // Extract quantities
        const quantityMatches = lowerText.match(/\b(satu|dua|tiga|empat|lima|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/g) || [];
        const quantities = quantityMatches.map(q => {
            const wordToNum = {
                'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
                'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
            };
            return wordToNum[q.toLowerCase()] || parseInt(q) || 1;
        });
        
        // Find matching menu items
        let quantityIndex = 0;
        Object.keys(menuItems).forEach(itemKey => {
            const itemData = menuItems[itemKey];
            const found = itemData.keywords.some(keyword => 
                lowerText.includes(keyword.toLowerCase())
            );
            
            if (found) {
                orders.push({
                    item: itemData.name,
                    price: itemData.price,
                    quantity: quantities[quantityIndex] || 1
                });
                quantityIndex++;
            }
        });
        
        return orders;
    }
    
    parseStructuredResponse(text) {
        const orders = [];
        console.log('Parsing structured response:', text);
        
        // Match lines like "- Teh ais, 1, RM3.00 each"
        const itemMatches = text.match(/^-\s*([^,]+),\s*(\d+),\s*RM(\d+\.?\d*)\s*each/gm);
        
        if (itemMatches) {
            itemMatches.forEach(match => {
                const parts = match.match(/^-\s*([^,]+),\s*(\d+),\s*RM(\d+\.?\d*)\s*each/);
                if (parts) {
                    const itemName = parts[1].trim();
                    const quantity = parseInt(parts[2]);
                    const price = parseFloat(parts[3]);
                    
                    console.log('Extracted from structured response:', itemName, quantity, price);
                    
                    orders.push({
                        item: itemName,
                        price: price,
                        quantity: quantity
                    });
                }
            });
        }
        
        console.log('Final parsed orders from structured response:', orders);
        return orders;
    }

    async loadConfig() {
        try {
            this.updateStatus('Loading configuration...');
            const response = await fetch('/api/config');
            const config = await response.json();
            
            this.apiKey = config.apiKey;
            this.endpoint = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
            
            if (this.apiKey && this.apiKey !== 'your_api_key_here') {
                this.connectToGemini();
            } else {
                this.updateStatus('Please configure your Google API key in the .env file', true);
            }
        } catch (error) {
            this.updateStatus('Failed to load configuration: ' + error.message, true);
        }
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.promptInput = document.getElementById('promptInput');
        this.status = document.getElementById('statusText');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.transcription = document.getElementById('transcription');
        
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscription());
        
        this.lastPrompt = '';
        this.promptInput.addEventListener('input', () => this.handlePromptChange());
    }
    
    handlePromptChange() {
        const currentPrompt = this.promptInput.value.trim();
        if (this.isConnected && currentPrompt !== this.lastPrompt) {
            this.updateStatus('Prompt changed. Click "Start Recording" to apply new instructions.');
        }
    }
    
    updateStatus(message, isError = false) {
        this.status.textContent = message;
        if (isError) {
            this.status.style.color = '#ff6b6b';
        } else {
            this.status.style.color = 'white';
        }
        console.log(message);
    }
    
    updateConnectionStatus(status) {
        this.connectionStatus.className = `connection-status ${status}`;
    }
    
    connectToGemini() {
        this.updateStatus('Connecting to Gemini Live API...');
        this.updateConnectionStatus('connecting');
        
        this.ws = new WebSocket(this.endpoint);
        
        this.ws.onopen = () => {
            console.log('Connected to Gemini Live API');
            this.updateConnectionStatus('connected');
            this.sendConfiguration();
        };
        
        this.ws.onmessage = async (event) => {
            try {
                let messageText;
                
                if (event.data instanceof Blob) {
                    messageText = await event.data.text();
                } else {
                    messageText = event.data;
                }
                
                const message = JSON.parse(messageText);
                this.handleGeminiMessage(message);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Connection error occurred', true);
            this.updateConnectionStatus('disconnected');
        };
        
        this.ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            this.updateStatus(`Connection closed: ${event.reason || 'Unknown reason'}`, true);
            this.updateConnectionStatus('disconnected');
            this.isConnected = false;
        };
    }
    
    sendConfiguration() {
        const userPrompt = this.promptInput.value.trim();
        
        const config = {
            setup: {
                model: this.model,
                generationConfig: {
                    responseModalities: ["TEXT"]
                }
            }
        };
        
        if (userPrompt) {
            config.setup.systemInstruction = {
                parts: [{
                    text: `${userPrompt}\n\nPlease respond to the user's voice input according to the instruction above. Be concise and helpful.`
                }]
            };
        } else {
            config.setup.systemInstruction = {
                parts: [{
                    text: "You are a voice transcription assistant. Simply transcribe what the user says clearly and accurately."
                }]
            };
        }
        
        console.log('Sending configuration:', config);
        this.ws.send(JSON.stringify(config));
    }
    
    handleGeminiMessage(message) {
        console.log('Received message:', message);
        
        if (message.setupComplete) {
            this.isConnected = true;
            this.updateStatus('✅ Ready to record! Click "Start Recording"');
            
        } else if (message.serverContent) {
            console.log('Server content:', message.serverContent);
            
            // Handle transcription from input
            if (message.serverContent.inputTranscription) {
                const transcript = message.serverContent.inputTranscription.text;
                console.log('Input transcription found:', transcript);
                if (transcript) {
                    this.appendTranscription(transcript);
                }
            }
            
            // Handle model response
            if (message.serverContent.modelTurn) {
                const turn = message.serverContent.modelTurn;
                console.log('Model turn found:', turn);
                if (turn.parts) {
                    turn.parts.forEach(part => {
                        if (part.text) {
                            console.log('Model response text:', part.text);
                            this.appendTranscription(part.text);
                        }
                    });
                }
            }
        }
    }
    
    appendTranscription(text) {
        const cleanText = text.trim();
        if (!cleanText) return;
        
        const currentContent = this.transcription.innerHTML;
        if (currentContent.includes('Your transcription will appear here...')) {
            this.transcription.innerHTML = cleanText;
        } else {
            this.transcription.innerHTML += ' ' + cleanText;
        }
        
        // Store full transcription for processing
        this.fullTranscription = this.transcription.textContent || this.transcription.innerText;
        
        console.log('🔍 Current full transcription:', this.fullTranscription);
        console.log('🔍 Contains "Subtotal:"?', this.fullTranscription.includes('Subtotal:'));
        
        // If transcription contains complete JSON (ends with ```), process the order
        if (this.fullTranscription.includes('```json') && this.fullTranscription.includes('}\n```')) {
            console.log('✅ Processing order with complete JSON detected');
            this.processCompleteOrder(this.fullTranscription);
        }
        
        this.transcription.scrollTop = this.transcription.scrollHeight;
    }
    
    async startRecording() {
        const currentPrompt = this.promptInput.value.trim();
        
        // Check if we need to reconnect due to prompt change
        if (this.isConnected && currentPrompt !== this.lastPrompt) {
            this.updateStatus('Reconnecting with new prompt...');
            this.ws.close();
            this.isConnected = false;
            // Wait a moment for the connection to close
            await new Promise(resolve => setTimeout(resolve, 500));
            this.connectToGemini();
            // Wait for connection to be established
            while (!this.isConnected) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (!this.isConnected) {
            this.updateStatus('Please wait for connection to be established', true);
            return;
        }
        
        // Update the last prompt and reset transcription tracking
        this.lastPrompt = currentPrompt;
        this.fullTranscription = '';
        this.orderProcessed = false;
        this.processedItems = new Set(); // Track which items we've already processed
        
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
            
            this.processor.onaudioprocess = (event) => {
                if (this.isRecording) {
                    const inputBuffer = event.inputBuffer.getChannelData(0);
                    this.sendPCMAudio(inputBuffer);
                }
            };
            
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.isRecording = true;
            
            this.startBtn.disabled = true;
            this.startBtn.classList.add('recording');
            this.stopBtn.disabled = false;
            this.updateStatus('🔴 Recording... Speak now!');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('Error accessing microphone: ' + error.message, true);
        }
    }
    
    stopRecording() {
        if (this.isRecording) {
            this.isRecording = false;
            
            if (this.processor) {
                this.processor.disconnect();
            }
            if (this.source) {
                this.source.disconnect();
            }
            if (this.audioContext) {
                this.audioContext.close();
            }
            
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
            }
            
            this.startBtn.disabled = false;
            this.startBtn.classList.remove('recording');
            this.stopBtn.disabled = true;
            this.updateStatus('Recording stopped. Ready to record again.');
        }
    }
    
    sendPCMAudio(audioBuffer) {
        if (!this.isConnected || !this.ws) return;
        
        try {
            const pcmData = new Int16Array(audioBuffer.length);
            for (let i = 0; i < audioBuffer.length; i++) {
                pcmData[i] = Math.max(-32768, Math.min(32767, audioBuffer[i] * 32768));
            }
            
            const uint8Array = new Uint8Array(pcmData.buffer);
            const base64Audio = btoa(String.fromCharCode(...uint8Array));
            
            const audioMessage = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }]
                }
            };
            
            this.ws.send(JSON.stringify(audioMessage));
            
        } catch (error) {
            console.error('Error sending PCM audio:', error);
            this.updateStatus('Error sending audio: ' + error.message, true);
        }
    }
    
    clearTranscription() {
        this.transcription.innerHTML = '<em>Your transcription will appear here...</em>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.voiceApp = new SimpleVoiceToText();
});