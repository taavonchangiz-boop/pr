// Minimal SMTP client (RFC 5321). Used by POSTYAR email provider when an SMTP
// relay is configured (cPanel supports SMTP relay via the local mail server).
// Uses Node's `net` for socket — compatible with Passenger.
import net from "node:tls";
import { Socket } from "node:net";

type SmtpOpts = {
  host: string;
  port: number;
  user: string;
  password: string;
  sender: string;
  senderName: string;
  to: string;
  subjectFa: string;
  htmlFa: string;
};

function quotedPrintableEncode(s: string): string {
  // Minimal: encode non-ASCII as UTF-8 quoted-printable
  const buf = Buffer.from(s, "utf8");
  let out = "";
  let lineLen = 0;
  for (const b of buf) {
    if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126) || b === 9 || b === 32) {
      out += String.fromCharCode(b);
      lineLen++;
    } else {
      const hex = b.toString(16).toUpperCase().padStart(2, "0");
      out += `=${hex}`;
      lineLen += 3;
    }
    if (lineLen >= 70) { out += "=\r\n"; lineLen = 0; }
  }
  return out;
}

export async function sendMail(opts: SmtpOpts): Promise<void> {
  // Open TLS socket if port is 465, else STARTTLS later. We support 465 and 587.
  let socket: Socket | net.TLSSocket;
  if (opts.port === 465) {
    socket = net.connect({ host: opts.host, port: opts.port, servername: opts.host, rejectUnauthorized: true });
  } else {
    socket = new Socket();
    socket.connect(opts.port, opts.host);
  }
  const buf: string[] = [];
  return new Promise<void>((resolve, reject) => {
    const write = (line: string) => socket.write(line + "\r\n");
    let step = 0;
    socket.setEncoding("utf8");
    socket.on("connect", () => { /* server speaks first */ });
    socket.on("data", (chunk: string) => {
      buf.push(chunk);
      const data = buf.join("");
      // Parse lines
      const lines = data.split("\r\n");
      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const ok = (line[3] === " " || line.length === 3);
        if (!ok) continue; // multi-line; wait for the final line
        if (step === 0 && code === 220) { write("EHLO postyar"); step = 1; continue; }
        if (step === 1 && code === 250) { write("AUTH LOGIN"); step = 2; continue; }
        if (step === 2 && code === 334) { write(Buffer.from(opts.user).toString("base64")); step = 3; continue; }
        if (step === 3 && code === 334) { write(Buffer.from(opts.password).toString("base64")); step = 4; continue; }
        if (step === 4 && code === 235) { write(`MAIL FROM:<${opts.sender}>`); step = 5; continue; }
        if (step === 5 && code === 250) { write(`RCPT TO:<${opts.to}>`); step = 6; continue; }
        if (step === 6 && code === 250) { write("DATA"); step = 7; continue; }
        if (step === 7 && code === 354) {
          const message =
            `From: =?UTF-8?Q?${quotedPrintableEncode(opts.senderName)}?= <${opts.sender}>\r\n` +
            `To: <${opts.to}>\r\n` +
            `Subject: =?UTF-8?Q?${quotedPrintableEncode(opts.subjectFa)}?=\r\n` +
            `MIME-Version: 1.0\r\n` +
            `Content-Type: text/html; charset=UTF-8\r\n` +
            `Content-Transfer-Encoding: quoted-printable\r\n\r\n` +
            `${quotedPrintableEncode(opts.htmlFa)}\r\n.\r\n`;
          write(message);
          step = 8; continue;
        }
        if (step === 8 && code === 250) { write("QUIT"); resolve(); socket.end(); break; }
        if (code >= 400) { reject(new Error(`SMTP error: ${line}`)); socket.destroy(); break; }
      }
      buf.length = 0;
    });
    socket.on("error", (err: NodeJS.ErrnoException) => reject(err));
    socket.setTimeout(15000, () => { reject(new Error("SMTP timeout")); socket.destroy(); });
  });
}
