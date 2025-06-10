#!/bin/bash

echo "🎯 Starting Quiz Application..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    echo "⚠️  Ignoring deprecated package warnings (normal for sqlite3/bcrypt)..."
    npm install --silent --no-fund --no-audit 2>/dev/null || npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Create questions directory if it doesn't exist
if [ ! -d "questions" ]; then
    echo "📁 Creating questions directory..."
    mkdir questions
fi

# Create public directory if it doesn't exist
if [ ! -d "public" ]; then
    echo "📁 Creating public directory..."
    mkdir public
fi

echo "✅ Dependencies installed successfully"
echo ""
echo "🚀 Starting server..."
echo "📺 Dashboard: http://localhost:3000/dashboard"
echo "📱 Client: http://localhost:3000"
echo "🖥️  Panel: http://localhost:3000/panel?pin=GAMEPIN"
echo ""
echo "💡 Tip: Pre custom PIN použite ?pin=vlastnypin"
echo "🔄 Refresh browser pages funguje automaticky (session recovery)"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start