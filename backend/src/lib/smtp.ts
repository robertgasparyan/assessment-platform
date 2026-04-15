import net from "node:net";
import { getEffectiveSmtpConfiguration } from "./platform-settings.js";

type SmtpResponse = {
  code: number;
  message: string;
  lines: string[];
};

class SmtpConnection {
  private buffer = "";
  private currentLines: string[] = [];
  private readyResponses: SmtpResponse[] = [];
  private waiters: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private socket: net.Socket;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string | Buffer) => {
      this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.flushBuffer();
    });
    this.socket.on("error", (error) => {
      while (this.waiters.length) {
        this.waiters.shift()?.reject(error instanceof Error ? error : new Error("SMTP connection error"));
      }
    });
    this.socket.on("close", () => {
      while (this.waiters.length) {
        this.waiters.shift()?.reject(new Error("SMTP connection closed"));
      }
    });
  }

  async readResponse() {
    const next = this.readyResponses.shift();
    if (next) {
      return next;
    }

    return new Promise<SmtpResponse>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  write(command: string) {
    this.socket.write(command);
  }

  end() {
    this.socket.end();
  }

  private flushBuffer() {
    while (this.buffer.includes("\n")) {
      const newlineIndex = this.buffer.indexOf("\n");
      const rawLine = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.processLine(rawLine);
    }
  }

  private processLine(line: string) {
    if (!line) {
      return;
    }

    this.currentLines.push(line);
    if (!/^\d{3}[ -]/.test(line)) {
      return;
    }

    if (line[3] === "-") {
      return;
    }

    const response = {
      code: Number(line.slice(0, 3)),
      message: this.currentLines.join("\n"),
      lines: [...this.currentLines]
    } satisfies SmtpResponse;
    this.currentLines = [];

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(response);
      return;
    }

    this.readyResponses.push(response);
  }
}

function assertResponse(response: SmtpResponse, expectedCodes: number[], context: string) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${context} failed: ${response.message}`);
  }
}

function escapeSmtpData(text: string) {
  return text
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function extractEmailAddress(address: string) {
  const match = address.match(/<([^>]+)>/);
  return match?.[1]?.trim() || address.trim();
}

function buildMessage({
  from,
  to,
  subject,
  body
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
}

async function sendCommand(connection: SmtpConnection, command: string, expectedCodes: number[], context: string) {
  connection.write(command);
  const response = await connection.readResponse();
  assertResponse(response, expectedCodes, context);
  return response;
}

async function authenticateIfNeeded(connection: SmtpConnection, ehloResponse: SmtpResponse) {
  const smtp = await getEffectiveSmtpConfiguration();
  const username = smtp.user.trim();
  const password = smtp.pass;

  if (!username || !password) {
    return;
  }

  const capabilities = ehloResponse.lines.join("\n").toUpperCase();
  if (capabilities.includes("AUTH PLAIN")) {
    const token = Buffer.from(`\u0000${username}\u0000${password}`, "utf8").toString("base64");
    await sendCommand(connection, `AUTH PLAIN ${token}\r\n`, [235], "SMTP authentication");
    return;
  }

  if (capabilities.includes("AUTH LOGIN")) {
    await sendCommand(connection, "AUTH LOGIN\r\n", [334], "SMTP authentication");
    await sendCommand(connection, `${Buffer.from(username, "utf8").toString("base64")}\r\n`, [334], "SMTP username");
    await sendCommand(connection, `${Buffer.from(password, "utf8").toString("base64")}\r\n`, [235], "SMTP password");
    return;
  }

  throw new Error("SMTP server does not advertise a supported AUTH method");
}

export async function sendReportEmail({
  to,
  subject,
  body
}: {
  to: string;
  subject: string;
  body: string;
}) {
  const smtp = await getEffectiveSmtpConfiguration();
  const from = smtp.from.trim();
  const host = smtp.host.trim();
  const port = smtp.port;

  if (!from || !host || !Number.isFinite(port)) {
    throw new Error("SMTP is not fully configured");
  }

  const socket = net.createConnection({
    host,
    port
  });
  const connection = new SmtpConnection(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", (error) => reject(error));
    socket.setTimeout(15000, () => reject(new Error("SMTP connection timed out")));
  });

  try {
    const greeting = await connection.readResponse();
    assertResponse(greeting, [220], "SMTP greeting");

    const ehloResponse = await sendCommand(connection, "EHLO localhost\r\n", [250], "SMTP EHLO");
    await authenticateIfNeeded(connection, ehloResponse);

    await sendCommand(connection, `MAIL FROM:<${extractEmailAddress(from)}>\r\n`, [250], "SMTP sender");
    await sendCommand(connection, `RCPT TO:<${extractEmailAddress(to)}>\r\n`, [250, 251], "SMTP recipient");
    await sendCommand(connection, "DATA\r\n", [354], "SMTP DATA");

    const message = buildMessage({
      from,
      to,
      subject,
      body
    });
    await sendCommand(connection, `${escapeSmtpData(message)}\r\n.\r\n`, [250], "SMTP message delivery");
    await sendCommand(connection, "QUIT\r\n", [221], "SMTP quit");
  } finally {
    connection.end();
  }
}
