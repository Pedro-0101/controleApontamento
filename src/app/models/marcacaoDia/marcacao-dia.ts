import { ComentarioMarcacao } from "../comentarioMarcacao/comentario-marcacao";
import { DateHelper } from "../../core/helpers/dateHelper";
import { Marcacao } from "../marcacao/marcacao";
import { Relogio } from "../relogio/relogio";

// 1. A interface define apenas a ESTRUTURA DOS DADOS (Shape)
export interface MarcacaoDia {
    id: number;
    cpf: string;
    matricula: string;
    nome: string;
    data: string; // Formato 'YYYY-MM-DD'
    marcacoes: Marcacao[]; // Array de horários no formato 'HH:mm'
    status?: statusMarcacaoDia;
    comentarios?: ComentarioMarcacao[];
    comentario?: string; // Comentário do dia (String simples)
}

// 2. O tipo define os possíveis valores para o status
export type statusMarcacaoDia = 'atraso' | 'corrigido' | 'falta' | 'ferias' | 'folga' | 'incompleto' | 'ok' | 'outro' | 'pendente';

// 3. A classe implementa a interface e adiciona a LÓGICA (Comportamento)
export class MarcacaoDia implements MarcacaoDia {
    id: number;
    cpf: string;
    matricula: string;
    nome: string;
    data: string;
    marcacoes: Marcacao[];
    comentarios?: ComentarioMarcacao[];
    comentario?: string;

    constructor(
        id: number,
        cpf: string,
        matricula: string,
        nome: string,
        data: string,
        marcacoes: Marcacao[],
        comentarios?: ComentarioMarcacao[]
    ) {
        this.id = id;
        this.cpf = cpf;
        this.matricula = matricula;
        this.nome = nome;
        this.comentarios = comentarios || [];
        this.data = data;

        // 1. Ordena as marcações recebidas
        this.marcacoes = this.ordenarMarcacoes(marcacoes);
    }

    getComentariosCount(): number {
        return this.comentarios?.length || 0;
    }

    getStatus(): statusMarcacaoDia {
        if (!this.marcacoes || this.marcacoes.length === 0) {
            return "falta";
        }

        if (this.marcacoes.length < 4 || this.marcacoes.length % 2 !== 0) {
            return "pendente";
        }
        return "ok";
    }

    private ordenarMarcacoes(marcacoes: Marcacao[]): Marcacao[] {
        if (!marcacoes) return [];

        const marcacoesOrdenadas = [...marcacoes];

        marcacoesOrdenadas.sort((a, b) => { return a.dataMarcacao.getTime() - b.dataMarcacao.getTime() });

        return marcacoesOrdenadas;
    }

    getDataFormatada(): string {
        const dataObj = DateHelper.fromStringDate(this.data);

        if (!dataObj) {
            console.error('MarcacaoDia.getDataFormatada: Data inválida', this.data);
            return '';
        }

        return DateHelper.getStringDate(dataObj);
    }

    getDiaSemana(): string {
        const dataObj = DateHelper.fromStringDate(this.data);
        if (!dataObj) return '';

        const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return dias[dataObj.getDay()];
    }

    getHorasTrabalhadas(): string {
        if (!this.marcacoes || this.marcacoes.length < 2) return '--:--';

        let totalMs = 0;
        // Calcula intervalos em pares (Entrada/Saída)
        for (let i = 0; i < this.marcacoes.length - 1; i += 2) {
            const entrada = this.marcacoes[i].dataMarcacao.getTime();
            const saida = this.marcacoes[i + 1].dataMarcacao.getTime();

            if (saida > entrada) {
                totalMs += (saida - entrada);
            }
        }

        if (totalMs === 0) return '--:--';

        const totalMinutes = Math.floor(totalMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    getMarcacoesFormatadas(): string {
        return this.marcacoes
            .map(m => DateHelper.getStringTime(m.dataMarcacao))
            .join(' - ');
    }

    getRelogiosIds(): string[] {
        let relogios: string[] = [];
        this.marcacoes.map(m => relogios.push(m.numSerieRelogio))

        return relogios;
    }
}