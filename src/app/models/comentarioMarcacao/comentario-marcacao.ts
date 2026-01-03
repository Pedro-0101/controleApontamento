export interface ComentarioMarcacao {
    userId: string;
    comentario: string;
    dataComentario: string; // Formato 'YYYY-MM-DD HH:mm'
}

export class ComentarioMarcacao implements ComentarioMarcacao {
    userId: string;
    comentario: string;
    dataComentario: string; // Formato 'YYYY-MM-DD HH:mm'

    constructor(userId: string, comentario: string, dataComentario: string) {
        this.userId = userId;
        this.comentario = comentario;
        this.dataComentario = dataComentario;
    }
}
