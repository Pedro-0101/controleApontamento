import { ComentarioMarcacao } from "../comentarioMarcacao/comentario-marcacao";

export interface MarcacaoDia {
    id: number;
    cpf: string;
    matricula: string;
    nome: string;
    data: string; // Formato 'YYYY-MM-DD'
    marcacoes: string[]; // Array de horários no formato 'HH:mm'
    status?: 'Ok' | 'Incompleto' | 'Pendente' | 'Falta' | 'Folga' | 'Ferias' | 'Corrigido' | 'Outro';
    comentarios?: ComentarioMarcacao[]; // Opcional: array de comentários associados ao dia

}

export class MarcacaoDiaImpl implements MarcacaoDia {
    id: number;
    cpf: string;
    matricula: string;
    nome: string;
    data: string;
    marcacoes: string[];
    status?: 'Ok' | 'Incompleto' | 'Pendente' | 'Falta' | 'Folga' | 'Ferias' | 'Corrigido' | 'Outro';
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
        this.data = data;
        this.marcacoes = marcacoes;
        this.status = "Ok"; // Fazer funcao para definir status com base nas marcacoes
        this.comentarios = comentarios;
    }
}
