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


    // Funcoes especificas para filtros de data

    // Retorna a data inicial e final para o filtro "Hoje"
    static getTodayRange(): { start: Date; end: Date } {
        const today = new Date();
        return { start: today, end: today };
    }

    // Retorna a data inicial e final para o filtro "Ontem"
    static getYesterdayRange(): { start: Date; end: Date } {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: yesterday, end: yesterday };
    }

    // Retorna a data inicial e final para o filtro "Últimos N dias"
    static getLastNDaysRange(n: number): { start: Date; end: Date } {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - n);
        return { start, end };
    }

    // Retorna a data inicial e final para o filtro "Este mês"
    static getThisMonthRange(): { start: Date; end: Date } {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = today;
        return { start, end };
    }

    // Retorna a data inicial e final para o filtro "Mês passado"
    static getLastMonthRange(): { start: Date; end: Date } {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start, end };
    }
}