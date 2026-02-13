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
    empresa?: string;
    evento?: string; // Nome do evento/status
    evento_categoria?: 'PERIODO' | 'FIXO'; // Categoria do evento
}

// 2. O tipo define os possíveis valores para o status
export type statusMarcacaoDia = 'Atraso' | 'Falta' | 'Incompleto' | 'Ok' | 'Outro' | 'Pendente';
export type statusFixos = 'Ferias' | 'Folga' | 'Afastado' | 'Atestado' | 'BH' | 'BH do Atraso' | 'Atraso Confirmado' | 'Falta Confirmada' | 'Corrigido' | 'Suspensao';

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
    empresa?: string;
    evento?: string;
    evento_categoria?: 'PERIODO' | 'FIXO';

    constructor(
        id: number,
        cpf: string,
        matricula: string,
        nome: string,
        data: string,
        marcacoes: Marcacao[],
        empresa?: string,
        comentarios?: ComentarioMarcacao[]
    ) {
        this.id = id;
        this.cpf = cpf;
        this.matricula = matricula;
        this.nome = nome;
        this.empresa = empresa || '';
        this.comentarios = comentarios || [];
        this.data = data;

        // 1. Ordena as marcações recebidas
        this.marcacoes = this.ordenarMarcacoes(marcacoes);
    }

    getComentariosCount(): number {
        return this.comentarios?.length || 0;
    }

    getStatus(): statusMarcacaoDia | string {
        // 1. Prioridade para Eventos de Período (Férias, Atestado, etc)
        if (this.evento_categoria === 'PERIODO') {
            return this.evento || "Evento";
        }

        // 2. Prioridade para Status Fixos (BH, Folga, etc)
        if (this.evento_categoria === 'FIXO') {
            return this.evento || "Status";
        }

        // Caso antigo onde categoria não estava definida (retrocompatibilidade temporária)
        if (this.evento && !this.evento_categoria) {
            return this.evento;
        }

        const dataObj = DateHelper.fromStringDate(this.data);
        if (!dataObj) return "Pendente";

        const diaSemana = dataObj.getDay();
        const numMarcacoes = this.marcacoes?.length || 0;
        const minutosTrabalhados = this.getWorkedMinutes();
        const horasTrabalhadas = minutosTrabalhados / 60;

        if (numMarcacoes % 2 !== 0) {
            return "Incompleto";
        }

        // Domingo: Não precisa bater ponto
        if (diaSemana === 0) {
            return "Ok";
        }

        if (numMarcacoes === 0) {
            return "Falta";
        }

        // Sábado: 2+ pontos e 4+ horas
        if (diaSemana === 6) {
            if (numMarcacoes === 2 && horasTrabalhadas >= 4 && horasTrabalhadas <= 6) {
                return "Ok";
            }
            if (numMarcacoes === 4 && horasTrabalhadas >= 4) {
                return "Ok";
            }
            return "Incompleto";
        }

        // Dias de semana: 4+ pontos e 8+ horas
        if (numMarcacoes >= 4) {
            return horasTrabalhadas >= 8 ? "Ok" : "Atraso";
        }

        return "Incompleto";
    }

    getWorkedMinutes(): number {
        if (!this.marcacoes || this.marcacoes.length < 2) return 0;

        let totalMs = 0;
        for (let i = 0; i < this.marcacoes.length - 1; i += 2) {
            const entrada = this.marcacoes[i].dataMarcacao.getTime();
            const saida = this.marcacoes[i + 1].dataMarcacao.getTime();

            if (saida > entrada) {
                totalMs += (saida - entrada);
            }
        }

        return Math.floor(totalMs / (1000 * 60));
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
        if (!this.marcacoes || this.marcacoes.length % 2 !== 0) return '--:--';

        const totalMinutes = this.getWorkedMinutes();
        if (totalMinutes === 0) return '--:--';

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