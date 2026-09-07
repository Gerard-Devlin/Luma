import {
  isAllowedRegistrationEmail,
  isValidEmail,
  normalizeEmail,
} from './email-policy';

describe('registration email policy', () => {
  test.each([
    'person@gmail.com',
    'person@outlook.com',
    'person@qq.com',
    'person@vip.qq.com',
    'person@163.com',
    'person@proton.me',
    'person@yahoo.co.jp',
  ])('allows mainstream provider %s', (email) => {
    expect(isAllowedRegistrationEmail(email)).toBe(true);
  });

  test.each([
    'student@university.edu',
    'student@cs.university.edu',
    'student@university.edu.cn',
    'student@university.ac.uk',
  ])('allows education address %s', (email) => {
    expect(isAllowedRegistrationEmail(email)).toBe(true);
  });

  test.each([
    'person@temporary-mail.example',
    'person@company.com',
    'person@gmail.com.evil.example',
    'person@university.edu.evil.example',
    'not-an-email',
  ])('rejects unsupported address %s', (email) => {
    expect(isAllowedRegistrationEmail(email)).toBe(false);
  });

  it('normalizes casing and surrounding whitespace', () => {
    expect(normalizeEmail('  Person@GMAIL.COM ')).toBe('person@gmail.com');
    expect(isAllowedRegistrationEmail('  Person@GMAIL.COM ')).toBe(true);
  });

  it('keeps syntax validation separate from provider validation', () => {
    expect(isValidEmail('person@company.com')).toBe(true);
    expect(isAllowedRegistrationEmail('person@company.com')).toBe(false);
  });
});
