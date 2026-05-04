import nodemailer from "nodemailer";
import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false,
  },
};

function normalizeFieldValue(value) {
  if (Array.isArray(value)) {
    return normalizeFieldValue(value[0]);
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function sanitizeEmail(email) {
  const value = normalizeFieldValue(email).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function sanitizeName(name) {
  const value = normalizeFieldValue(name).trim().replace(/\s+/g, " ");
  if (!value) {
    return "";
  }

  return value.replace(/[<>]/g, "").slice(0, 60);
}

function sanitizeQuestion(question) {
  const value = normalizeFieldValue(question).trim().replace(/\r\n/g, "\n");
  if (!value) {
    return "";
  }

  return value.replace(/[<>]/g, "").slice(0, 2000);
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"]|'/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parsePayload(req) {
  const contentType = String(req.headers["content-type"] || "");

  if (contentType.includes("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const form = formidable({ multiples: false });

      form.parse(req, (error, fields) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(fields || {});
      });
    });
  }

  const rawBody = await readRawBody(req);
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    const parsed = new URLSearchParams(rawBody);
    return Object.fromEntries(parsed.entries());
  }
}

function buildEmailHTML({ name, email, question }) {
  const displayName = name || "there";
  const escapedName = escapeHtml(displayName);
  const escapedEmail = escapeHtml(email);
  const escapedQuestion = escapeHtml(question).replace(/\n/g, "<br />");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We received your question</title>
</head>
<body style="margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:linear-gradient(180deg,#07111f 0%,#0b1630 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:#0d1728;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.35);">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#0f4c81 0%,#06b6d4 100%);">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.82);font-weight:bold;">MeetRecap</div>
                    <div style="font-size:24px;line-height:1.2;color:#ffffff;font-weight:700;margin-top:6px;">Thanks for asking</div>
                    <div style="font-size:14px;line-height:1.5;color:rgba(255,255,255,0.9);margin-top:6px;">We received your question and we will revert to you shortly.</div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <div style="width:60px;height:60px;border-radius:18px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;font-size:30px;">💬</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:30px 28px 22px;">
              <p style="margin:0 0 10px;color:#8ed2ff;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Support request received</p>
              <h2 style="margin:0 0 14px;color:#f4f8ff;font-size:22px;line-height:1.3;">Hi ${escapedName}, we’re reviewing your message now.</h2>
              <p style="margin:0 0 22px;color:#c8d4e5;font-size:14px;line-height:1.7;">Thank you for reaching out to MeetRecap. Our team will review your question and get back to you as soon as possible using this email address.</p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;border-collapse:separate;">
                <tr>
                  <td style="padding:16px 18px;background:#101d31;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8ed2ff;margin-bottom:10px;">Your question</div>
                    <div style="color:#e8eef8;font-size:14px;line-height:1.7;word-break:break-word;">${escapedQuestion.replace(/\n/g, "<br />")}</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px;">
                <tr>
                  <td style="padding:16px 18px;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.18);border-radius:16px;color:#d9f4ff;font-size:13px;line-height:1.6;">
                    <strong style="color:#ffffff;">Submitted by:</strong> ${escapedEmail}<br />
                    <strong style="color:#ffffff;">What happens next:</strong> our team will check your request and reply shortly.
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9fb2ca;font-size:12px;line-height:1.7;">If you didn’t send this request, you can ignore this email safely.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 26px;background:#0a1424;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:12px;color:#b6c6d8;line-height:1.7;">MeetRecap is built to help teams create, join, and manage meetings faster.</div>
              <div style="margin-top:8px;font-size:11px;color:#71839c;">© ${new Date().getFullYear()} MeetRecap. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const payload = await parsePayload(req);
    const email = sanitizeEmail(payload.email || payload.userEmail || payload.to);
    const name = sanitizeName(payload.name || payload.displayName);
    const question = sanitizeQuestion(payload.question || payload.message || payload.askQuestion);

    if (!email || !question) {
      return res.status(400).json({ success: false, message: "Email and question are required" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"MeetRecap Support" <${process.env.GMAIL_USER}>`,
      to: email,
      replyTo: process.env.GMAIL_USER,
      subject: "MeetRecap Support - We received your question",
      text: [
        `Hi ${name || "there"},`,
        "",
        "Thanks for asking a question on MeetRecap.",
        "We received your message and will revert to you shortly.",
        "",
        `Question: ${question}`,
        "",
        "MeetRecap Support",
      ].join("\n"),
      html: buildEmailHTML({ name, email, question }),
    });

    return res.status(200).json({ success: true, message: "Support email sent" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Email failed" });
  }
}
