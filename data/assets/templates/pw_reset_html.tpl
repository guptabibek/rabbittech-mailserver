<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Reset your password</title>
    <style>
      @media all and (max-width: 480px) {
        .rt-pad { padding-left: 20px !important; padding-right: 20px !important; }
      }
    </style>
  </head>
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
                <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 30px; font-weight: 700;">Reset your password</h1>
                <p style="margin: 0 0 12px; font-size: 15px; line-height: 24px; color: #3c4256;">Hello {{username2}},</p>
                <p style="margin: 0 0 20px; font-size: 15px; line-height: 24px; color: #3c4256;">
                  Somebody asked for a new password for the {{hostname}} account <strong style="color: #10121b;">{{username}}</strong>. The link below lets you choose one; it works for the next {{token_lifetime}} minutes.
                </p>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 0 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius: 8px; background-color: #7c3aed;">
                      <a href="{{link}}" style="display: inline-block; padding: 12px 22px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Choose a new password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 16px 0 0; font-size: 13px; line-height: 20px; color: #5f667a;">If the button doesn't work, copy this link into your browser:</p>
                <p style="margin: 4px 0 0; font-size: 13px; line-height: 20px; word-break: break-all;"><a href="{{link}}" style="color: #6d28d9;">{{link}}</a></p>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 20px 36px 28px;">
                <p style="margin: 0; font-size: 14px; line-height: 22px; color: #3c4256;">
                  If you didn't ask for this, you can ignore this email. Your password stays the same.
                </p>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 16px 36px 24px; border-top: 1px solid #e6e8ef; font-size: 12px; line-height: 18px; color: #6a7085;">
                Requested on {{date}}. This message was sent automatically by {{hostname}}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
