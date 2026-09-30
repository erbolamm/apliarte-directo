import net from 'node:net';
import os from 'node:os';

function getIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function forward(bindHost, port, targetPort = port) {
  const server = net.createServer((clientSocket) => {
    const targetSocket = net.connect(targetPort, '127.0.0.1');
    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
    clientSocket.on('error', () => targetSocket.destroy());
    targetSocket.on('error', () => clientSocket.destroy());
  });

  server.listen(port, bindHost, () => {
    console.log(`[Bridge OK] ${bindHost}:${port} -> 127.0.0.1:${targetPort}`);
  });

  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      console.error(`[Bridge Error] ${bindHost}:${port}:`, err.message);
    }
  });

  return server;
}

const activeIps = getIpAddresses();
console.log('IPs activas detectadas:', activeIps);

for (const ip of activeIps) {
  forward(ip, 8790, 8790);
  forward(ip, 7979, 7979);
}
