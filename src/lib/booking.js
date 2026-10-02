const { isValidUuid } = require('./validation');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;

function validateBookingInput({ barbershop_id, service_id, barber_id, date, start_time }) {
  if (!isValidUuid(barbershop_id) || !isValidUuid(service_id)) return 'Serviço ou barbearia inválidos';
  if (barber_id != null && !isValidUuid(barber_id)) return 'Barbeiro inválido';
  if (typeof date !== 'string' || !DATE_RE.test(date)) return 'Data inválida';
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Data inválida';
  if (typeof start_time !== 'string' || !TIME_RE.test(start_time)) return 'Horário inválido';
  return null;
}

function mapBookingError(error) {
  const message = String(error?.message || '');
  if (message.includes('SLOT_UNAVAILABLE')) return { status: 409, error: 'Horário indisponível. Escolha outro.' };
  if (message.includes('SHOP_CLOSED')) return { status: 409, error: 'A barbearia está fechada nesta data.' };
  if (message.includes('OUTSIDE_BUSINESS_HOURS')) return { status: 409, error: 'O serviço não cabe no horário de funcionamento.' };
  if (message.includes('DATE_IN_PAST')) return { status: 400, error: 'Não é possível agendar em uma data passada.' };
  if (message.includes('SERVICE_NOT_FOUND')) return { status: 404, error: 'Serviço não encontrado para esta barbearia.' };
  if (message.includes('CUSTOMER_NOT_FOUND')) return { status: 404, error: 'Cliente não encontrado.' };
  if (message.includes('BARBER_NOT_FOUND')) return { status: 404, error: 'Barbeiro não encontrado para esta barbearia.' };
  if (message.includes('SHOP_NOT_OWNED')) return { status: 403, error: 'Barbearia não pertence à sua empresa.' };
  return { status: 500, error: 'Erro ao criar agendamento. Tente novamente.' };
}

module.exports = { mapBookingError, validateBookingInput };
