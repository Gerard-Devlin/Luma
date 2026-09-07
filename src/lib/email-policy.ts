const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public mailbox providers that are commonly used for personal accounts.
// Keep this list explicit: accepting arbitrary domains would also accept
// disposable mail services.
const MAINSTREAM_EMAIL_DOMAINS = new Set([
  '126.com',
  '139.com',
  '163.com',
  '189.cn',
  '21cn.com',
  'aliyun.com',
  'aol.com',
  'bk.ru',
  'daum.net',
  'fastmail.com',
  'foxmail.com',
  'gmail.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'googlemail.com',
  'hanmail.net',
  'hey.com',
  'hotmail.com',
  'hotmail.co.uk',
  'icloud.com',
  'inbox.ru',
  'list.ru',
  'live.com',
  'mac.com',
  'mail.com',
  'mail.ru',
  'me.com',
  'msn.com',
  'naver.com',
  'outlook.com',
  'outlook.jp',
  'proton.me',
  'protonmail.com',
  'qq.com',
  'sina.cn',
  'sina.com',
  'sohu.com',
  'tuta.com',
  'tutanota.com',
  'tutanota.de',
  'wo.cn',
  'yahoo.ca',
  'yahoo.co.jp',
  'yahoo.co.uk',
  'yahoo.com',
  'yahoo.com.au',
  'yahoo.com.hk',
  'yahoo.com.tw',
  'yeah.net',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
]);

// Academic namespaces used by universities in addition to the global .edu TLD.
const EDUCATION_DOMAIN_SUFFIXES = [
  '.edu',
  '.edu.au',
  '.edu.cn',
  '.edu.hk',
  '.edu.my',
  '.edu.sg',
  '.edu.tw',
  '.ac.id',
  '.ac.il',
  '.ac.in',
  '.ac.ir',
  '.ac.jp',
  '.ac.kr',
  '.ac.nz',
  '.ac.th',
  '.ac.uk',
  '.ac.za',
];

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function isAllowedRegistrationEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) return false;

  const domain = email.slice(email.lastIndexOf('@') + 1);
  return (
    Array.from(MAINSTREAM_EMAIL_DOMAINS).some(
      (providerDomain) =>
        domain === providerDomain || domain.endsWith(`.${providerDomain}`)
    ) || EDUCATION_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))
  );
}
