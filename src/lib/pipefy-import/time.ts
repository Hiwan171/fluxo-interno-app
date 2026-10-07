/**
 * Converte o horário de parede de uma célula do Excel num instante absoluto.
 *
 * O Excel guarda data e hora sem fuso. A biblioteca de leitura entrega a célula
 * como um `Date` em UTC cujos números são exatamente os do relógio ("14:24" vira
 * `T14:24Z`). Interpretar isso como UTC deslocaria tudo em 3 horas para quem
 * trabalha em Brasília; aqui os números são lidos como hora local do fuso dado.
 */
export function wallClockToInstant(wall: Date, timeZone: string): Date {
  const wallAsUtc = wall.getTime();

  // Duas passadas resolvem o caso em que o deslocamento no instante estimado
  // difere do deslocamento no instante real (virada de horário de verão).
  let instant = wallAsUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = wallAsUtc - offsetMs(new Date(instant), timeZone);
  }

  return new Date(instant);
}

/** Diferença, em ms, entre o relógio do fuso e o UTC no instante dado. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const clockAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );

  return clockAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

/** Verdadeiro quando o horário de parede é exatamente meia-noite. */
export function isMidnight(wall: Date): boolean {
  return (
    wall.getUTCHours() === 0 &&
    wall.getUTCMinutes() === 0 &&
    wall.getUTCSeconds() === 0 &&
    wall.getUTCMilliseconds() === 0
  );
}
