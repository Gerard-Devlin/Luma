import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from 'react-email';
import type { ReactElement, ReactNode } from 'react';

const GITHUB_URL = 'https://github.com/Gerard-Devlin/Luma';

const boxedTailwindConfig = {
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        'bg-2': '#f5f5f4',
        fg: '#171717',
        'fg-2': '#525252',
        'fg-3': '#737373',
        'fg-inverted': '#ffffff',
      },
      fontSize: {
        11: ['11px', '16px'],
        13: ['13px', '20px'],
        16: ['16px', '26px'],
        28: ['28px', '34px'],
      },
      screens: {
        mobile: { max: '640px' },
      },
    },
  },
};

const EmailTailwind = Tailwind as (props: {
  children: ReactNode;
  config: typeof boxedTailwindConfig;
}) => ReactElement | null;

type ConfirmEmailProps = {
  companyName: string;
  logoUrl: string;
  url: string;
  username: string;
};

export function ConfirmEmail({
  companyName,
  logoUrl,
  url,
  username,
}: ConfirmEmailProps) {
  return (
    <EmailTailwind config={boxedTailwindConfig}>
      <Html>
        <Head />
        <Body className='m-0 bg-bg-2 text-center font-sans'>
          <Preview>Confirm your email address</Preview>
          <Container className='mobile:mt-0 mx-auto mt-8 w-full max-w-[640px]'>
            <Section>
              <Section className='bg-bg mobile:px-2 px-6 py-4'>
                <Section className='mb-3 px-6'>
                  <Row>
                    <Column className='w-1/2 py-[7px] align-middle' />
                    <Column
                      align='right'
                      className='w-1/2 py-[7px] align-middle'
                    >
                      <Text className='m-0 text-right font-sans text-13'>
                        <span className='text-fg-3'>{companyName}</span>
                      </Text>
                    </Column>
                  </Row>
                </Section>

                <Section className='bg-bg-2 mobile:px-6 mobile:py-12 rounded-[8px] px-[40px] py-[64px] text-center'>
                  <Section className='mb-3'>
                    <Img
                      src={logoUrl}
                      alt='Logo'
                      width={48}
                      className='mx-auto mb-5 block'
                    />
                    <Heading
                      as='h1'
                      className='m-0 font-sans text-28 font-bold text-fg'
                    >
                      We&apos;re almost there!
                    </Heading>
                  </Section>

                  <Text className='mx-auto mb-8 mt-0 max-w-[420px] text-center font-sans text-16 text-fg-2'>
                    Hi {username}, thank you for signing up for {companyName}.
                    <br />
                    To verify your account, we just need to confirm your email
                    address.
                  </Text>

                  <Section className='mb-6 text-center'>
                    <Button
                      href={url}
                      className='inline-block rounded-lg bg-fg px-7 py-4 text-center font-sans text-16 leading-6 text-fg-inverted'
                    >
                      Confirm email
                    </Button>
                  </Section>

                  <Text className='mx-auto mb-0 mt-8 max-w-[400px] text-center font-sans text-13 text-fg-3'>
                    If you didn&apos;t request this,
                    <br />
                    please ignore this email.
                  </Text>
                </Section>

                <Section className='bg-bg'>
                  <Row>
                    <Column className='px-6 py-10 text-center'>
                      <Text className='mx-auto mb-8 mt-0 max-w-[320px] text-center font-sans text-13 text-fg-3'>
                        This confirmation link expires in 24 hours and can only
                        be used once.
                      </Text>

                      <Section className='mb-8'>
                        <Link
                          href={GITHUB_URL}
                          className='inline-block px-2 align-middle'
                        >
                          <Img
                            src={logoUrl}
                            alt='GitHub'
                            width={18}
                            className='block'
                          />
                        </Link>
                      </Section>

                      <Text className='m-0 text-center font-sans text-11 text-fg-3'>
                        Button not working? Open this link:
                        <br />
                        <Link href={url} className='text-fg-3 underline'>
                          {url}
                        </Link>
                      </Text>
                    </Column>
                  </Row>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </EmailTailwind>
  );
}

ConfirmEmail.PreviewProps = {
  companyName: 'Luma',
  logoUrl: 'https://example.com/logo.png',
  url: 'https://example.com/api/register/confirm?token=preview',
  username: 'Devlin',
} satisfies ConfirmEmailProps;

export default ConfirmEmail;
