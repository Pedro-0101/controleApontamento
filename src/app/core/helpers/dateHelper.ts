import { DateTime } from "luxon";

export class DateHelper {

    // Transforma uma data DateTime para o formato ISO (YYYY-MM-DD)
    static toStefaniniFormat(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    // Transforma uma data no formato ISO (YYYY-MM-DD) para DateTime
    static FromStefaniniFormat(dateStr: string): DateTime {
        return DateTime.fromISO(dateStr);
    }

    // Converte uma data UTC para a data local
    static toLocalDate(date: Date): Date {
        const localDate = new Date(date);
        localDate.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return localDate;
    }

    // Retorna uma string formatada de data no formato DD/MM/YYYY
    static getStringDate(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${day}/${month}/${year}`;
    }

    // Retorna uma string formatada de hora no formato HH:MM
    static getStringTime(date: Date): string {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // Retona primeiro dia do mes de uma data
    static getFirstDayOfMonth(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    // Retona ultimo dia do mes de uma data
    static getLastDayOfMonth(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }
}