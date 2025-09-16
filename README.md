🛡️ CyberSecure Chatbot:

A simple cybersecurity-themed chatbot built with HTML, CSS, JavaScript, PHP, and the OpenAI API.
It runs locally on WAMP and provides a user-friendly way to ask security questions.

Features:

💬 Chat with GPT (via OpenAI API)

🔒 Cybersecurity theme with dark UI

📌 Preset questions (e.g., password safety, securing your computer, what to do if hacked)

🧹 Clear button to reset the chat

🎨 Responsive, modern design

Requirements: 
-WAMP
-PHP 8+ with curl and openssl enabled
-An OpenAI API key

🚀 Setup

Clone this repository into your WAMP www folder:

git clone https://github.com/AhmedAmineLoukil/cybersecurity-chatbot.git

Inside the chatbot folder, create a file named .env:

OPENAI_API_KEY=your_api_key_here


Make sure php.ini has the correct certificate path (for cURL SSL):

curl.cainfo = "C:\wamp64\cacert.pem"
openssl.cafile = "C:\wamp64\cacert.pem"


Start WAMP and open in your browser:

http://localhost/chatbot/