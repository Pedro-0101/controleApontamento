export interface ComentarioMarcacao {
    comentario: string;
    criado_por: string;
    criado_em: string; // ISO string from backend
}

export class ComentarioMarcacao implements ComentarioMarcacao {
    comentario: string;
    criado_por: string;
    criado_em: string;

    constructor(comentario: string, criado_por: string, criado_em: string) {
        this.comentario = comentario;
        this.criado_por = criado_por;
        this.criado_em = criado_em;
    }

    getRelativeTime(): string {
        const now = new Date();
        const comentarioDate = new Date(this.criado_em);
        const diffMs = now.getTime() - comentarioDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'agora';
        if (diffMins < 60) return `${diffMins}min atrás`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h atrás`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d atrás`;
    }
}
