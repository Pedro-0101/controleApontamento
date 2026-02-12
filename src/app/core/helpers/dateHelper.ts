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

    // Transforma uma string de data no formato 'DD/MM/YYYY' para um objeto Date
    static fromStringDate(dateStr: string): Date | null {
        if (!dateStr || typeof dateStr !== 'string') {
            console.log('erro na data:', dateStr);
            return null;
        }
        const parts = dateStr.split('/').map(p => p.trim());
        if (parts.length !== 3) {
            console.log('erro na data:', dateStr);
            return null;
        }
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        const year = Number(parts[2]);
        if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
            console.log('erro na data:', dateStr);
            return null;
        }
        return new Date(year, month - 1, day);
    }

    // Retorna uma string formatada de data no formato DD/MM/YYYY
    static getStringDate(date: Date): string {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            console.log("erro na data:", date);
            return '';
        }

        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    }

    // Retorna uma string formatada de hora no formato HH:MM
    static getStringTime(date: Date): string {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    static getDataInicioRequisicaoRelogio(): string {
        return '01/01/2000 00:00:00';
    }

    static getDataFimRequisicaoRelogio(): string {
        return '31/12/2100 23:59:59';
    }


    // Funcoes especificas para filtros de data

    // Retorna a data inicial e final para o filtro "Hoje"
    static getTodayRange(): { start: string; end: string } {
        const today = new Date();
        const dateStr = DateHelper.getStringDate(today);
        return { start: dateStr, end: dateStr };
    }

    // Retorna a data inicial e final para o filtro "Ontem"
    static getYesterdayRange(): { start: string; end: string } {
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const dateStr = DateHelper.getStringDate(yesterday);
        return { start: dateStr, end: dateStr };
    }

    // Retorna a data inicial e final para o filtro "Últimos N dias"
    static getLastNDaysRange(n: number): { start: string; end: string } {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - n);

        const start = DateHelper.getStringDate(startDate);
        const end = DateHelper.getStringDate(endDate);
        return { start, end };
    }

    // Retorna a data inicial e final para o filtro "Este mês"
    static getThisMonthRange(): { start: string; end: string } {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        const endDate = today;

        const start = DateHelper.getStringDate(startDate);
        const end = DateHelper.getStringDate(endDate);
        return { start, end };
    }

    // Retorna a data inicial e final para o filtro "Mês passado"
    static getLastMonthRange(): { start: string; end: string } {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endDate = new Date(today.getFullYear(), today.getMonth(), 0);

        const start = DateHelper.getStringDate(startDate);
        const end = DateHelper.getStringDate(endDate);
        return { start, end };
    }
    // Converte DD/MM/YYYY para YYYY-MM-DD
    static toIsoDate(dateStr: string): string {
        const parts = dateStr.split('/');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
}