<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Messages waiting in quarantine</title>
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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e6e8ef; border-radius: 14px; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #10121b;">
            <tr>
              <td class="rt-pad" style="padding: 28px 36px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">
                Rabbit<span style="color: #7c3aed;">Tech</span> <span style="font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #6a7085;">MAIL</span>
              </td>
            </tr>
            <tr>
              <td class="rt-pad" style="padding: 24px 36px 4px;">
                <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 30px; font-weight: 700;">
                  {% if counter == 1 %}1 new message is waiting in quarantine{% else %}{{counter}} new messages are waiting in quarantine{% endif %}
                </h1>
                <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #3c4256;">
                  Hi {{username}}, these messages were held back because they look like spam or could be harmful.
                  {% if quarantine_acl == 1 %}If you recognise one and trust the sender, you can release it.{% endif %}
                </p>
              </td>
            </tr>
            {% for line in meta|reverse %}
            <tr>
              <td class="rt-pad" style="padding: 0 36px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e6e8ef; border-radius: 10px;">
                  <tr>
                    <td style="padding: 14px 16px;">
                      <p style="margin: 0 0 4px; font-size: 15px; line-height: 22px; font-weight: 600; word-break: break-word;">{{ line.subject|e }}</p>
                      <p style="margin: 0 0 8px; font-size: 14px; line-height: 20px; color: #3c4256; word-break: break-all;">{{ line.sender|e }}</p>
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #5f667a;">
                        {% if line.action == "reject" %}Rejected{% else %}Sent to your Junk folder{% endif %}
                        &nbsp;&middot;&nbsp; Spam score {{ line.score }}
                        &nbsp;&middot;&nbsp; {{ line.created }}
                      </p>
                      {% if quarantine_acl == 1 %}
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
                        <tr>
                          <td style="border-radius: 8px; background-color: #7c3aed;">
                            <a href="https://{{ hostname }}/qhandler/release/{{ line.qhash }}" style="display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #ffffff; text-decoration: none;">{% if line.action == "reject" %}Release to inbox{% else %}Send copy to inbox{% endif %}</a>
                          </td>
                          <td style="width: 8px;"></td>
                          <td style="border-radius: 8px; border: 1px solid #d5d9e3;">
                            <a href="https://{{ hostname }}/qhandler/delete/{{ line.qhash }}" style="display: inline-block; padding: 7px 14px; font-size: 13px; font-weight: 600; color: #3c4256; text-decoration: none;">Delete</a>
                          </td>
                        </tr>
                      </table>
                      {% endif %}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            {% endfor %}
            <tr>
              <td class="rt-pad" style="padding: 12px 36px 24px; font-size: 12px; line-height: 18px; color: #6a7085;">
                This message was sent automatically by {{ hostname }}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
