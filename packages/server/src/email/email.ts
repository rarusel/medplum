import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { createTransport as createNodemailerTransport } from 'nodemailer';
import { default as createPostmarkTransport } from 'nodemailer-postmark-transport';
import MailComposer from 'nodemailer/lib/mail-composer';
import Mail, { Address } from 'nodemailer/lib/mailer';
import { getConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { rewriteAttachments, RewriteMode } from '../fhir/rewrite';
import { logger } from '../logger';

/**
 * Sends an email using the AWS SES service.
 * Builds the email using nodemailer MailComposer.
 * See options here: https://nodemailer.com/extras/mailcomposer/
 * @param options The MailComposer options.
 */
export async function sendEmail(options: Mail.Options): Promise<void> {
  const fromAddress = getConfig().supportEmail;
  const toAddresses = buildAddresses(options.to);
  const ccAddresses = buildAddresses(options.cc);
  const bccAddresses = buildAddresses(options.bcc);
  logger.info(`Sending email to ${toAddresses?.join(', ')} subject "${options.subject}"`);

  const options_with_rewritten_attachments: Mail.Options = await rewriteAttachments(
    RewriteMode.PRESIGNED_URL, 
    systemRepo, 
    {
      ...options,
      from: fromAddress,
      sender: fromAddress,
    },
  );

  if (process.env.POSTMARK_API_TOKEN) {
    const client = createNodemailerTransport(
      createPostmarkTransport({
        auth: {
          apiKey: process.env.POSTMARK_API_TOKEN, 
        }, 
        // postmarkOptions: {}, 
      }),
    );
    await client.sendMail(options_with_rewritten_attachments);
  } 
  else {
    const sesClient = new SESv2Client({ region: getConfig().awsRegion });
    const msg = await buildRawMessage(options_with_rewritten_attachments);
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses,
        BccAddresses: bccAddresses,
      },
      Content: {
        Raw: {
          Data: msg,
        },
      },
    })
  );
  }
}

function buildAddresses(input: string | Address | Array<string | Address> | undefined): string[] | undefined {
  if (!input) {
    return undefined;
  }
  if (Array.isArray(input)) {
    return input.map(addressToString) as string[];
  }
  return [addressToString(input) as string];
}

function addressToString(address: Address | string | undefined): string | undefined {
  if (address) {
    if (typeof address === 'string') {
      return address;
    }
    if (typeof address === 'object' && 'address' in address) {
      return address.address;
    }
  }
  return undefined;
}

function buildRawMessage(options: Mail.Options): Promise<Uint8Array> {
  const msg = new MailComposer(options);
  return new Promise((resolve, reject) => {
    msg.compile().build((err, message) => {
      if (err) {
        return reject(err);
      }
      resolve(message);
    });
  });
}
