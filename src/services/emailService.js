import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[EmailService] SMTP ausente; e-mails transacionais serao apenas registrados sem conteudo pessoal.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port || '465', 10),
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || 'PoçosHost <contato@pocoshost.com>';
  const client = getTransporter();

  if (!client) {
    console.warn('[EmailService] SMTP ausente; e-mail transacional não enviado.', {
      toDomain: typeof to === 'string' ? to.split('@')[1] : undefined,
      subject,
      from,
    });
    return { mock: true };
  }

  try {
    const info = await client.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[EmailService] Email sent successfully: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('[EmailService] Failed to send email:', error);
    throw error;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const parts = dateStr.toString().split('-');
  if (parts.length === 3) {
    return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function sendReservationConfirmationToGuest(reservation) {
  const checkInFormated = formatDate(reservation.check_in);
  const checkOutFormated = formatDate(reservation.check_out);
  const totalFormated = formatCurrency(reservation.total_price);

  const subject = `Pagamento Confirmado - Sua reserva em ${reservation.property_title} está garantida!`;

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5b251; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background-color: #111111; padding: 24px; text-align: center; border-bottom: 2px solid #e5b251;">
        <h1 style="color: #e5b251; margin: 0; font-size: 24px; letter-spacing: 1px;">PoçosHost</h1>
      </div>
      <div style="padding: 32px; background-color: #ffffff; color: #333333;">
        <h2 style="color: #111111; margin-top: 0; font-size: 20px;">Olá, ${reservation.guest_name}!</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #555555;">
          Excelentes notícias! O seu pagamento foi confirmado e a sua reserva para <strong>${reservation.property_title}</strong> está garantida.
        </p>

        <div style="background-color: #fcf9f2; border-left: 4px solid #e5b251; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #111111; font-size: 16px; margin-bottom: 12px;">Detalhes da Reserva:</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #777777; width: 120px;"><strong>Check-in:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${checkInFormated}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Check-out:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${checkOutFormated}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Hóspedes:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${reservation.guests} ${reservation.guests > 1 ? 'pessoas' : 'pessoa'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Valor Pago:</strong></td>
              <td style="padding: 6px 0; color: #e5b251; font-weight: bold; font-size: 16px;">${totalFormated}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #666666;">
          Se você tiver alguma dúvida, pode entrar em contato diretamente com o anfitrião através do e-mail: <a href="mailto:${reservation.host_email}" style="color: #e5b251; text-decoration: none;">${reservation.host_email}</a>.
        </p>

        <div style="margin-top: 32px; text-align: center;">
          <a href="https://pocoshost.com/reservas" style="background-color: #111111; color: #e5b251; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; font-size: 14px; border: 1px solid #e5b251; display: inline-block; transition: all 0.2s ease;">
            Ver Minhas Reservas
          </a>
        </div>
      </div>
      <div style="background-color: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #999999; border-top: 1px solid #eeeeee;">
        Este é um e-mail transacional automático enviado por PoçosHost.<br>
        &copy; 2026 PoçosHost. Todos os direitos reservados.
      </div>
    </div>
  `;

  const text = `
Olá, ${reservation.guest_name}!

Excelentes notícias! O seu pagamento foi confirmado e a sua reserva para "${reservation.property_title}" está garantida.

Detalhes da Reserva:
- Check-in: ${checkInFormated}
- Check-out: ${checkOutFormated}
- Hóspedes: ${reservation.guests}
- Valor Pago: ${totalFormated}

Se tiver dúvidas, entre em contato com o anfitrião pelo e-mail: ${reservation.host_email}.
Verifique suas reservas em: https://pocoshost.com/reservas

Atenciosamente,
Equipe PoçosHost
  `;

  return sendEmail({ to: reservation.guest_email, subject, html, text });
}

export async function sendReservationConfirmationToHost(reservation) {
  const checkInFormated = formatDate(reservation.check_in);
  const checkOutFormated = formatDate(reservation.check_out);
  const hostNetFormated = formatCurrency(reservation.host_net);

  const subject = `Nova Reserva Confirmada - ${reservation.property_title}`;

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5b251; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="background-color: #111111; padding: 24px; text-align: center; border-bottom: 2px solid #e5b251;">
        <h1 style="color: #e5b251; margin: 0; font-size: 24px; letter-spacing: 1px;">PoçosHost</h1>
      </div>
      <div style="padding: 32px; background-color: #ffffff; color: #333333;">
        <h2 style="color: #111111; margin-top: 0; font-size: 20px;">Olá!</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #555555;">
          Você tem uma nova reserva confirmada para o seu imóvel: <strong>${reservation.property_title}</strong>.
        </p>

        <div style="background-color: #fcf9f2; border-left: 4px solid #e5b251; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #111111; font-size: 16px; margin-bottom: 12px;">Detalhes do Hóspede e Período:</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #777777; width: 120px;"><strong>Hóspede:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${reservation.guest_name} (${reservation.guest_email})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Check-in:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${checkInFormated}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Check-out:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${checkOutFormated}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Hóspedes:</strong></td>
              <td style="padding: 6px 0; color: #111111;">${reservation.guests} ${reservation.guests > 1 ? 'pessoas' : 'pessoa'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #777777;"><strong>Seu Repasse Líquido:</strong></td>
              <td style="padding: 6px 0; color: #e5b251; font-weight: bold; font-size: 16px;">${hostNetFormated}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #666666;">
          Por favor, prepare a acomodação para receber o seu hóspede. Caso precise de mais detalhes, você pode acessar o seu painel de controle.
        </p>

        <div style="margin-top: 32px; text-align: center;">
          <a href="https://pocoshost.com/painel/reservas" style="background-color: #111111; color: #e5b251; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; font-size: 14px; border: 1px solid #e5b251; display: inline-block; transition: all 0.2s ease;">
            Ver Reservas Recebidas
          </a>
        </div>
      </div>
      <div style="background-color: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #999999; border-top: 1px solid #eeeeee;">
        Este é um e-mail transacional automático enviado por PoçosHost.<br>
        &copy; 2026 PoçosHost. Todos os direitos reservados.
      </div>
    </div>
  `;

  const text = `
Olá!

Uma nova reserva foi confirmada para o seu imóvel "${reservation.property_title}".

Detalhes da Reserva:
- Hóspede: ${reservation.guest_name} (${reservation.guest_email})
- Check-in: ${checkInFormated}
- Check-out: ${checkOutFormated}
- Hóspedes: ${reservation.guests}
- Seu Repasse Líquido: ${hostNetFormated}

Prepare o seu imóvel para receber o hóspede.
Gerencie suas reservas em: https://pocoshost.com/painel/reservas

Atenciosamente,
Equipe PoçosHost
  `;

  return sendEmail({ to: reservation.host_email, subject, html, text });
}
