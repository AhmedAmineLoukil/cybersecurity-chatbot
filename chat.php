<?php
// chatbot/chat.php

header('Content-Type: application/json');

// Allow only POST JSON
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$userMessage = trim($input['message'] ?? '');
if ($userMessage === '') {
  echo json_encode(['error' => 'Empty message']);
  exit;
}

// Load API key (Windows env var OR .env file)
$apiKey = getenv('OPENAI_API_KEY');
if (!$apiKey) {
  // Try .env (simple parser)
  $envPath = __DIR__ . '/.env';
  if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
      if (strpos($line, 'OPENAI_API_KEY=') === 0) {
        $apiKey = trim(substr($line, strlen('OPENAI_API_KEY=')));
        break;
      }
    }
  }
}
if (!$apiKey) {
  echo json_encode(['error' => 'API key not configured']);
  exit;
}

// Build payload for OpenAI Responses API
$payload = [
  'model' => 'gpt-4o-mini',  // choose a fast, cost-effective model; adjust as needed
  'input' => [
    [
      'role' => 'system',
      'content' => 'You are a helpful web chat assistant.',
    ],
    [
      'role' => 'user',
      'content' => $userMessage
    ]
  ],
  // Safety: short max output; tweak for your UX
  'max_output_tokens' => 500,
];

$ch = curl_init('https://api.openai.com/v1/responses');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey
  ],
  CURLOPT_POSTFIELDS => json_encode($payload),
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 30,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($err) {
  echo json_encode(['error' => 'cURL error: ' . $err]);
  exit;
}

if ($httpCode < 200 || $httpCode >= 300) {
  echo json_encode(['error' => "OpenAI API HTTP $httpCode", 'details' => $response]);
  exit;
}

// Parse OpenAI response (Responses API returns structured content)
$data = json_decode($response, true);
$reply = '';

// Find the assistant text (defensive parsing across potential shapes)
if (isset($data['output']) && is_array($data['output'])) {
  foreach ($data['output'] as $item) {
    if (($item['type'] ?? '') === 'message' && isset($item['content'])) {
      foreach ($item['content'] as $c) {
        if (($c['type'] ?? '') === 'output_text') {
          $reply .= $c['text'] ?? '';
        }
      }
    }
  }
}

// Fallbacks
if (!$reply && isset($data['response']['output_text'])) {
  $reply = $data['response']['output_text'];
}

echo json_encode(['reply' => $reply ?: '(no content)']);
