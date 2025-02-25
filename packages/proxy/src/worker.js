const HTML_CONTENT = `<!DOCTYPE html>
<html>
<head>
    <title>Request Logger Proxy</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prismjs/1.29.0/prism.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prismjs/1.29.0/themes/prism.min.css">
    <script>
        async function createProxy() {
            const url = document.getElementById('urlInput').value;
            if (!url) return;
            
            const response = await fetch('/create-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            
            const { proxyUrl, id } = await response.json();
            document.getElementById('proxyUrl').textContent = proxyUrl;
            document.getElementById('proxyId').value = id;
            document.getElementById('results').style.display = 'block';
        }

        async function viewLogs() {
            const id = document.getElementById('proxyId').value;
            const response = await fetch(\`/logs/\${id}\`);
            const logs = await response.json();
            
            const logsHtml = logs.map(log => \`
                <div class="log-entry">
                    <h3>\${new Date(log.timestamp).toLocaleString()}</h3>
                    <h4>Request:</h4>
                    <pre><code class="language-json">\${JSON.stringify(log.request, null, 2)}</code></pre>
                    <h4>Response:</h4>
                    <pre><code class="language-json">\${JSON.stringify(log.response, null, 2)}</code></pre>
                </div>
            \`).join('');
            
            document.getElementById('logs').innerHTML = logsHtml;
            Prism.highlightAll();
        }
    </script>
    <style>
        body { max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; }
        .input-group { margin: 20px 0; }
        input[type="text"] { width: 100%; padding: 8px; margin: 8px 0; }
        button { padding: 8px 16px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; }
        #results { display: none; margin-top: 20px; }
        .log-entry { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 4px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Request Logger Proxy</h1>
    <div class="input-group">
        <label for="urlInput">Enter URL to proxy:</label>
        <input type="text" id="urlInput" placeholder="https://example.com">
        <button onclick="createProxy()">Create Proxy</button>
    </div>
    
    <div id="results">
        <h2>Your Proxy URL:</h2>
        <p id="proxyUrl"></p>
        <input type="hidden" id="proxyId">
        <button onclick="viewLogs()">View Logs</button>
        <div id="logs"></div>
    </div>
</body>
</html>`;

// KV namespace binding: PROXY_LOGS

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Serve landing page
        if (url.pathname === '/') {
            return new Response(HTML_CONTENT, {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        // Create new proxy
        if (url.pathname === '/create-proxy') {
            if (request.method === 'POST') {
                const { url: targetUrl } = await request.json();
                const id = crypto.randomUUID();
                await env.PROXY_LOGS.put(`config:${id}`, targetUrl);
                const proxyUrl = `${url.origin}/proxy/${id}`;
                return new Response(JSON.stringify({ proxyUrl, id }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Get logs
        if (url.pathname.startsWith('/logs/')) {
            const id = url.pathname.split('/')[2];
            const logs = await env.PROXY_LOGS.get(`logs:${id}`);
            return new Response(logs || '[]', {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Handle proxy requests
        if (url.pathname.startsWith('/proxy/')) {
            const id = url.pathname.split('/')[2];
            const targetUrl = await env.PROXY_LOGS.get(`config:${id}`);

            if (!targetUrl) {
                return new Response('Proxy not found', { status: 404 });
            }

            // Forward the request
            const proxyUrl = new URL(targetUrl);
            const proxyRequest = new Request(proxyUrl, request);
            const response = await fetch(proxyRequest);

            // Log the request and response
            const log = {
                timestamp: new Date().toISOString(),
                request: {
                    method: request.method,
                    headers: Object.fromEntries(request.headers),
                    url: request.url
                },
                response: {
                    status: response.status,
                    headers: Object.fromEntries(response.headers),
                    body: await response.clone().text()
                }
            };

            const existingLogs = JSON.parse(await env.PROXY_LOGS.get(`logs:${id}`) || '[]');
            existingLogs.push(log);
            await env.PROXY_LOGS.put(`logs:${id}`, JSON.stringify(existingLogs));

            return response;
        }

        return new Response('Not found', { status: 404 });
    }
};