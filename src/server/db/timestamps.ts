export type TimestampFields = {
  createdAt: Date;
  updatedAt: Date;
};

export const SERVICE_TIME_ZONE = "Asia/Seoul";

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const kstDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: SERVICE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function nowTimestamp() {
  return new Date();
}

export function withCreateTimestamps<T extends object>(data: T, now = nowTimestamp()) {
  return {
    ...data,
    createdAt: now,
    updatedAt: now,
  } satisfies T & TimestampFields;
}

export function withUpdateTimestamp<T extends object>(data: T, now = nowTimestamp()) {
  return {
    ...data,
    updatedAt: now,
  } satisfies T & Pick<TimestampFields, "updatedAt">;
}

export function toKstDate(value: Date) {
  return kstDateFormatter.format(value);
}

export function toKstDateTime(value: Date) {
  return `${kstDateTimeFormatter.format(value)} KST`;
}
