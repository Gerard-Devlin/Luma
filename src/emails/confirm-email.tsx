import * as React from 'react';

type ConfirmEmailProps = {
  companyName: string;
  logoUrl?: string;
  url: string;
  username: string;
};

const pageStyle: React.CSSProperties = {
  margin: 0,
  backgroundColor: '#f4f4f5',
  color: '#18181b',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const containerStyle: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '40px 20px',
};

const cardStyle: React.CSSProperties = {
  borderRadius: '20px',
  backgroundColor: '#ffffff',
  padding: '32px',
  boxShadow: '0 24px 70px rgba(24,24,27,0.12)',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: '999px',
  backgroundColor: '#18181b',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  lineHeight: '22px',
  padding: '12px 22px',
  textDecoration: 'none',
};

const mutedTextStyle: React.CSSProperties = {
  color: '#71717a',
  fontSize: '13px',
  lineHeight: '20px',
};

export function ConfirmEmail({
  companyName,
  logoUrl,
  url,
  username,
}: ConfirmEmailProps) {
  return (
    <html>
      <head>
        <title>Confirm your {companyName} account</title>
      </head>
      <body style={pageStyle}>
        <div style={containerStyle}>
          <div style={cardStyle}>
            {logoUrl ? (
              <img
                src={logoUrl}
                width='48'
                height='48'
                alt={companyName}
                style={{
                  borderRadius: '12px',
                  display: 'block',
                  marginBottom: '24px',
                }}
              />
            ) : null}
            <h1
              style={{
                fontSize: '24px',
                lineHeight: '32px',
                margin: '0 0 16px',
              }}
            >
              Confirm your {companyName} account
            </h1>
            <p style={{ fontSize: '15px', lineHeight: '24px', margin: 0 }}>
              Hi {username},
            </p>
            <p style={{ fontSize: '15px', lineHeight: '24px' }}>
              Click the button below to finish creating your {companyName}{' '}
              account.
            </p>
            <p style={{ margin: '28px 0' }}>
              <a href={url} style={buttonStyle}>
                Confirm account
              </a>
            </p>
            <p style={mutedTextStyle}>
              This link expires in 24 hours and can only be used once. If you
              did not create a {companyName} account, you can safely ignore this
              email.
            </p>
            <p style={mutedTextStyle}>
              If the button does not work, copy and paste this link into your
              browser:
            </p>
            <p
              style={{
                ...mutedTextStyle,
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
            >
              <a href={url} style={{ color: '#2563eb' }}>
                {url}
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
