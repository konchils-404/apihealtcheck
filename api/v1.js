const url = require('url');
const tls = require('tls');
const net = require('net');

module.exports = async (req, res) => {
  const { query } = url.parse(req.url, true);
  const ip = query.ip;
  const port = query.port;

  if (!ip || !port) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing ip or port parameter' }));
    return;
  }

  try {
    const result = await checkProxy(ip, port);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result, null, 2));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
  }
};

function checkProxy(ip, port) {
  const host = 'speed.cloudflare.com';
  const path = '/meta';
  const payload = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n`;

  return new Promise((resolve, reject) => {
    const start = Date.now();

    const socket = net.connect({ host: ip, port: parseInt(port) }, () => {
      const secureSocket = tls.connect(
        {
          socket,
          servername: host,
          rejectUnauthorized: false,
        },
        () => {
          secureSocket.write(payload);
        }
      );

      let data = '';

      secureSocket.on('data', (chunk) => {
        data += chunk.toString();
      });

      secureSocket.on('end', () => {
        const parts = data.split('\r\n\r\n');
        try {
          const json = JSON.parse(parts[1]);
          const end = Date.now();
          const response_time = end - start;

          if (json.clientIp) {
            resolve({
              success: true,
              proxy: {
                ip,
                port: String(port),
              },
              is_proxy: true,
              response_time,
              data: {
                hostname: host,
                clientIp: json.clientIp,
                httpProtocol: json.httpProtocol || 'Unknown',
                asn: parseInt(json.asn) || 0,
                asOrganization: json.asOrganization || 'Unknown',
                colo: json.colo || 'Unknown',
                country: json.country || 'Unknown',
                city: json.city || 'Unknown',
                region: json.region || 'Unknown',
                postalCode: json.postalCode || 'Unknown',
                latitude: json.latitude || 'Unknown',
                longitude: json.longitude || 'Unknown',
                ip: json.clientIp,
              },
            });
          } else {
            reject(new Error('Invalid JSON response'));
          }
        } catch (e) {
          reject(new Error('Failed to parse JSON from proxy'));
        }
      });

      secureSocket.on('error', (err) => {
        reject(new Error('TLS socket error: ' + err.message));
      });
    });

    socket.on('error', (err) => {
      reject(new Error('TCP socket error: ' + err.message));
    });
  });
}

function getCountryName(code) {
  try {
    if (!code) return 'Unknown';
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function getCountryFlag(code) {
  try {
    if (!code) return '';
    return code.toUpperCase().replace(/./g, char =>
      String.fromCodePoint(127397 + char.charCodeAt())
    );
  } catch {
    return '';
  }
}
