<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Your mailbox is {{percent}}% full</title>
    <style>
      @media all and (max-width: 480px) {
        .rt-pad { padding-left: 20px !important; padding-right: 20px !important; }
      }
    </style>
  </head>
  {% set bar = percent if percent <= 100 else 100 %}
  {% if percent >= 95 %}{% set color = '#e11d48' %}{% elif percent >= 80 %}{% set color = '#d97706' %}{% else %}{% set color = '#7c3aed' %}{% endif %}
  <body style="margin: 0; padding: 0; background-color: #f5f6fa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f6fa;">
      <tr>
        <td align="center" style="padding: 32px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e6e8ef; border-radius: 14px; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #10121b;">
            <tr>
              <td class="rt-pad" style="padding: 28px 36px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">
                Rabbit<span style="color: #7c3aed;">Tech</span> <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #6a7085;">MAIL</span>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 24px 36px 0;">
                <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 30px; font-weight: 700;">Your mailbox is {{percent}}% full</h1>
                <p style="margin: 0 0 20px; font-size: 15px; line-height: 24px; color: #3c4256;">
                  Hi {{username}}, your mailbox is running out of space. When it is full, new messages can't be delivered to you.
                </p>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 0 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius: 999px; background-color: #e6e8ef;">
                  <tr>
                    {% if bar > 0 %}<td width="{{bar}}%" height="10" style="height: 10px; font-size: 0; line-height: 0; background-color: {{color}}; border-radius: 999px;">&nbsp;</td>{% endif %}
                    {% if bar < 100 %}<td width="{{100 - bar}}%" height="10" style="height: 10px; font-size: 0; line-height: 0;">&nbsp;</td>{% endif %}
                  </tr>
                </table>
                <p style="margin: 8px 0 0; font-size: 13px; line-height: 20px; font-weight: 600; color: {{color}};">{{percent}}% used</p>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 20px 36px 28px;">
                <p style="margin: 0 0 8px; font-size: 15px; line-height: 24px; font-weight: 600;">To free up space</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 15px; line-height: 24px; color: #3c4256;">
                  <li>Delete messages you no longer need, especially ones with large attachments.</li>
                  <li>Empty the Trash and Junk folders.</li>
                  <li>Ask your administrator if you need more space.</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 16px 36px 24px; border-top: 1px solid #e6e8ef; font-size: 12px; line-height: 18px; color: #6a7085;">
                This message was sent automatically by your mail server.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
