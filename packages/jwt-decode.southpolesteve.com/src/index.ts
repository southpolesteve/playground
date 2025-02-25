// src/index.ts
interface Env {
    // Define any bindings or environment variables here
}

interface DecodedJWT {
    header: Record<string, any>;
    payload: Record<string, any>;
    signature: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle OPTIONS for CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }

        // Get URL parameters
        const url = new URL(request.url);
        const token = url.searchParams.get('token');

        // If GET with token parameter, decode and return
        if (request.method === 'GET' && token) {
            try {
                const decoded = decodeJWT(token);
                return jsonResponse(decoded);
            } catch (error) {
                return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
            }
        }

        // If POST, expect token in request body
        if (request.method === 'POST') {
            try {
                const contentType = request.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    const { token } = await request.json<{ token?: string }>();
                    if (!token) {
                        return jsonResponse({ error: 'Missing token in request body' }, 400);
                    }

                    const decoded = decodeJWT(token);
                    return jsonResponse(decoded);
                } else {
                    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
                }
            } catch (error) {
                return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
            }
        }

        // If neither GET with token nor valid POST, return HTML interface
        return new Response(generateHTML(), {
            headers: {
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};

function handleCORS(): Response {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}

function jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function decodeJWT(token: string): DecodedJWT {
    // Verify the token format
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format. Expected header.payload.signature');
    }

    try {
        // Decode the header and payload (base64url decode)
        const header = JSON.parse(base64UrlDecode(parts[0]));
        const payload = JSON.parse(base64UrlDecode(parts[1]));

        // Return decoded parts (signature is kept as is)
        return {
            header,
            payload,
            signature: parts[2]
        };
    } catch (error) {
        throw new Error('Failed to decode JWT: ' + (error instanceof Error ? error.message : String(error)));
    }
}

function base64UrlDecode(input: string): string {
    // Replace URL-safe characters and add padding
    const base64 = input
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    // Add padding if needed
    const padding = base64.length % 4;
    const paddedBase64 = padding ?
        base64 + '='.repeat(4 - padding) :
        base64;

    // Decode the base64 string
    // Using atob directly as we're in Cloudflare Workers
    // which supports standard Web APIs
    const binary = atob(paddedBase64);

    return binary;
}

function generateHTML(): string {
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JWT Decoder</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        color: #333;
      }
      h1 {
        text-align: center;
        margin-bottom: 30px;
      }
      textarea {
        width: 100%;
        height: 100px;
        padding: 12px;
        margin-bottom: 20px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: monospace;
        resize: vertical;
      }
      button {
        background-color: #f48120;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background-color: #e67012;
      }
      pre {
        background-color: #f7f7f7;
        padding: 15px;
        border-radius: 4px;
        overflow: auto;
        margin-top: 20px;
      }
      .sections {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-top: 20px;
      }
      .section {
        background-color: #f7f7f7;
        padding: 15px;
        border-radius: 4px;
      }
      .section h3 {
        margin-top: 0;
        border-bottom: 1px solid #ddd;
        padding-bottom: 10px;
      }
      .error {
        color: #d9534f;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>JWT Decoder</h1>
    <p>Enter a JWT token to decode. This decoder works locally in your browser and tokens are never sent to any server.</p>
    
    <textarea id="token" placeholder="Paste your JWT token here..."></textarea>
    <button onclick="decodeToken()">Decode Token</button>
    
    <div id="result" class="sections" style="display: none;">
      <div class="section">
        <h3>Header</h3>
        <pre id="header"></pre>
      </div>
      <div class="section">
        <h3>Payload</h3>
        <pre id="payload"></pre>
      </div>
      <div class="section">
        <h3>Signature (encoded)</h3>
        <pre id="signature"></pre>
      </div>
    </div>
    
    <div id="error" class="error" style="display: none; margin-top: 20px;"></div>
    
    <script>
      function decodeToken() {
        const token = document.getElementById('token').value.trim();
        const resultDiv = document.getElementById('result');
        const errorDiv = document.getElementById('error');
        
        errorDiv.style.display = 'none';
        resultDiv.style.display = 'none';
        
        if (!token) {
          errorDiv.textContent = 'Please enter a JWT token';
          errorDiv.style.display = 'block';
          return;
        }
        
        try {
          // Verify format
          const parts = token.split('.');
          if (parts.length !== 3) {
            throw new Error('Invalid JWT format. Expected header.payload.signature');
          }
          
          // Decode the parts
          const header = JSON.parse(base64UrlDecode(parts[0]));
          const payload = JSON.parse(base64UrlDecode(parts[1]));
          
          // Display the decoded token
          document.getElementById('header').textContent = JSON.stringify(header, null, 2);
          document.getElementById('payload').textContent = JSON.stringify(payload, null, 2);
          document.getElementById('signature').textContent = parts[2];
          resultDiv.style.display = 'flex';
        } catch (error) {
          errorDiv.textContent = 'Error: ' + error.message;
          errorDiv.style.display = 'block';
        }
      }
      
      function base64UrlDecode(input) {
        // Replace URL-safe characters and add padding
        const base64 = input
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        const padding = base64.length % 4;
        const paddedBase64 = padding ? 
          base64 + '='.repeat(4 - padding) : 
          base64;
        
        // Decode
        const binary = atob(paddedBase64);
        
        // Convert to string
        return binary;
      }
    </script>
  </body>
  </html>`;
}