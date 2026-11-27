import { ComentarioMarcacao } from '../../models/comentarioMarcacao/comentario-marcacao';

/**
 * Formata a lista de comentários de um dia para exportação.
 * Cada comentário fica em uma linha no formato `| usuário: comentário`.
 */
export function formatarComentarios(comentarios?: ComentarioMarcacao[] | null): string {
    if (!comentarios || comentarios.length === 0) return '';

    return comentarios
        .map(c => `| ${c.criado_por || 'Sistema'}: ${c.comentario ?? ''}`)
        .join('\n');
}
