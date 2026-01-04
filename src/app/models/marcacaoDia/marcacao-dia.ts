import { ComentarioMarcacao } from "../comentarioMarcacao/comentario-marcacao";
import { DateHelper } from "../../core/helpers/dateHelper";

// 1. A interface define apenas a ESTRUTURA DOS DADOS (Shape)
export interface MarcacaoDia {
    id: number;
    cpf: string;
    matricula: string;
    nome: string;
    data: string; // Formato 'YYYY-MM-DD'
    marcacoes: string[]; // Array de horários no formato 'HH:mm'
    status?: statusMarcacaoDia;
    comentarios?: ComentarioMarcacao[];
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
    marcacoes: string[];
    comentarios?: ComentarioMarcacao[];

    constructor(
        id: number, 
        cpf: string,
        matricula: string,
        nome: string, 
        data: string, 
        marcacoes: string[],
        comentarios?: ComentarioMarcacao[]
    ) {
        this.id = id;
        this.cpf = cpf;
        this.matricula = matricula;
        this.nome = nome;
        this.comentarios = comentarios;
        this.data = data;

        // 1. Ordena as marcações recebidas
        this.marcacoes = this.ordenarMarcacoes(marcacoes);

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

    private ordenarMarcacoes(marcacoes: string[]): string[] {
        if (!marcacoes) return [];
        
        const marcacoesOrdenadas = [...marcacoes];
        
        marcacoesOrdenadas.sort((a, b) => {
            const [horaA, minutoA] = a.split(':').map(Number);
            const [horaB, minutoB] = b.split(':').map(Number);
            
            if (horaA !== horaB) {
                return horaA - horaB;
            }
            return minutoA - minutoB;
        });
        
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

    getMarcacoesFormatadas(): string {
        let marcacoesFormatadas = this.marcacoes.join(', ');

        marcacoesFormatadas = marcacoesFormatadas.replaceAll(', ', ' - ');

        return marcacoesFormatadas;

    }
}