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
    trabalhaSabado?: boolean;
}

// 2. O tipo define os possíveis valores para o status
export type statusMarcacaoDia = 'Atraso' | 'Falta' | 'Incompleto' | 'Ok' | 'Outro' | 'Pendente' | 'Em andamento';
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
    trabalhaSabado?: boolean;

    constructor(
        id: number,
        cpf: string,
        matricula: string,
        nome: string,
        data: string,
        marcacoes: Marcacao[],
        empresa?: string,
        trabalhaSabado: boolean = true,
        comentarios?: ComentarioMarcacao[]
    ) {
        this.id = id;
        this.cpf = cpf;
        this.matricula = matricula;
        this.nome = nome;
        this.empresa = empresa || '';
        this.trabalhaSabado = trabalhaSabado;
        this.comentarios = comentarios || [];
        this.data = data;

        // 1. Ordena as marcações recebidas
        this.marcacoes = this.ordenarMarcacoes(marcacoes);
    }

    getComentariosCount(): number {
        return this.comentarios?.length || 0;
    }

    getStatus(): statusMarcacaoDia | string {
        const dataObj = DateHelper.fromStringDate(this.data);
        if (!dataObj) return "Pendente";

        const diaSemana = dataObj.getDay();
        const marcacoesValidas = (this.marcacoes || []).filter(m => !m.desconsiderado);
        const numMarcacoes = marcacoesValidas.length;
        const minutosTrabalhados = this.getWorkedMinutes();
        const horasTrabalhadas = minutosTrabalhados / 60;

        let isIncompleto = false;
        const isHoje = dataObj.getDate() === new Date().getDate();
        const isEmAndamento = isHoje && diaSemana !== 0 && numMarcacoes >= 1;

        if (numMarcacoes > 0 && !isEmAndamento) {
            if (numMarcacoes % 2 !== 0) {
                isIncompleto = true;
            } else if (diaSemana === 6) {
                if (!((numMarcacoes === 2 && horasTrabalhadas >= 4 && horasTrabalhadas <= 6) ||
                    (numMarcacoes === 4 && horasTrabalhadas >= 4))) {
                    isIncompleto = true;
                }
            } else if (diaSemana !== 0) { // Dias de semana
                if (numMarcacoes < 4) {
                    isIncompleto = true;
                }
            }
        }

        const evtStr = this.evento ? this.evento.trim() : null;

        // 1. Exceção explícita: Incompleto sobrepõe Feriado
        if (evtStr === 'Feriado' && isIncompleto) {
            return "Incompleto";
        }

        // 2. Eventos lançados (Fixo, Período, etc) sempre sobrepõem os status calculados
        if (evtStr) {
            return evtStr;
        }

        // 3. Se não houver eventos, retorna os status calculados
        if (isEmAndamento) return "Em andamento";
        if (isIncompleto) return "Incompleto";

        if (numMarcacoes > 0) {
            if (diaSemana === 6) {
                return "Ok";
            } else {
                return horasTrabalhadas >= 8 ? "Ok" : "Atraso";
            }
        }

        if (diaSemana === 0) return "Ok";

        if (numMarcacoes === 0) {
            if (diaSemana === 6 && !this.trabalhaSabado) return "Ok";
            return "Falta";
        }

        return "Falta";
    }

    getWorkedMinutes(): number {
        const marcacoesValidas = (this.marcacoes || []).filter(m => !m.desconsiderado);
        if (marcacoesValidas.length < 2) return 0;

        let totalMs = 0;
        for (let i = 0; i < marcacoesValidas.length - 1; i += 2) {
            const entrada = marcacoesValidas[i].dataMarcacao.getTime();
            const saida = marcacoesValidas[i + 1].dataMarcacao.getTime();

            if (saida > entrada) {
                totalMs += (saida - entrada);
            }
        }

        return Math.floor(totalMs / (1000 * 60));
    }

    isDiaSeguinte(m: Marcacao): boolean {
        const jornadaDate = DateHelper.fromStringDate(this.data);
        if (!jornadaDate) return false;

        const mDate = m.dataMarcacao;

        // Comparar apenas as datas (ano, mês, dia)
        const d1 = new Date(mDate.getFullYear(), mDate.getMonth(), mDate.getDate());
        const d2 = new Date(jornadaDate.getFullYear(), jornadaDate.getMonth(), jornadaDate.getDate());

        return d1.getTime() > d2.getTime();
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
        const marcacoesValidas = (this.marcacoes || []).filter(m => !m.desconsiderado);
        if (!marcacoesValidas || marcacoesValidas.length % 2 !== 0) return '--:--';

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