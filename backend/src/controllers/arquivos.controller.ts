import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  arquivoPublico,
  obterBanco,
  type ArquivoRegistro,
} from '../database/conexao';
import type { RequisicaoAutenticada } from '../middlewares/authMiddleware';
import { ladoDaCarta, ROTULO_LADO } from '../utils/lado';
import {
  categoriaValida,
  deckValido,
  falhou,
  inteiroEntre,
  statusValido,
  texto,
  textoOpcional,
  type DeckId,
  type StatusEstudo,
} from '../utils/validar';

function encaixar(
  userId: string,
  deckId: string,
  nome: string,
  descricao: string,
): { deck: Exclude<DeckId, 'avulso'>; deck_id: string } | { erro: string } {
  const linha = obterBanco()
    .prepare('SELECT faccao FROM decks WHERE id = ? AND user_id = ?')
    .get(deckId, userId) as { faccao: string } | undefined;
  if (!linha || !(linha.faccao in ROTULO_LADO)) {
    return { erro: 'Deck não encontrado.' };
  }
  const lado = ladoDaCarta(`${nome}\n${descricao}`);
  const faccao = linha.faccao as Exclude<DeckId, 'avulso'>;
  if (!lado) {
    return {
      erro: 'Esta carta não pertence a um lado. Só entram Jedi, Sith, Rebeldes, Império, República, Separatistas, Mandalorianos e Caçadores.',
    };
  }
  if (lado !== faccao) {
    return { erro: `Esta carta é ${ROTULO_LADO[lado]} e só entra em um deck ${ROTULO_LADO[lado]}.` };
  }
  return { deck: lado, deck_id: deckId };
}

function exigirUsuario(req: RequisicaoAutenticada, res: Response): string | null {
  if (!req.userId) {
    res.status(401).json({ erro: 'Sessão ausente.' });
    return null;
  }
  return req.userId;
}

export function listar(req: RequisicaoAutenticada, res: Response): void {
  const userId = exigirUsuario(req, res);
  if (!userId) return;

  const linhas = obterBanco()
    .prepare('SELECT * FROM arquivos WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as unknown as ArquivoRegistro[];

  res.status(200).json(linhas.map(arquivoPublico));
}

export function criar(req: RequisicaoAutenticada, res: Response): void {
  const userId = exigirUsuario(req, res);
  if (!userId) return;

  const itemId = texto(req.body?.item_id, 'item_id', 80);
  const categoria = categoriaValida(req.body?.categoria);
  const nome = texto(req.body?.nome, 'Nome', 200);
  const imagem = texto(req.body?.imagem_url, 'Imagem', 2000);
  const descricao = textoOpcional(req.body?.descricao, 'Descrição', 8000);

  if (falhou(itemId) || falhou(categoria) || falhou(nome) || falhou(imagem) || falhou(descricao)) {
    const primeiro = [itemId, categoria, nome, imagem, descricao].find(falhou);
    res.status(400).json({ erro: primeiro?.erro ?? 'Dados inválidos.' });
    return;
  }

  const statusInformado = req.body?.status === undefined ? 'Para Explorar' : statusValido(req.body.status);
  const deckInformado = req.body?.deck === undefined ? 'avulso' : deckValido(req.body.deck);
  const progressoInformado = req.body?.progresso === undefined ? 0 : inteiroEntre(req.body.progresso, 'Progresso', 0, 100);
  const notaInformada = req.body?.nota === undefined ? 0 : inteiroEntre(req.body.nota, 'Nota', 0, 10);
  const anotacaoInformada =
    req.body?.anotacao === undefined || req.body?.anotacao === ''
      ? ''
      : texto(req.body.anotacao, 'Anotação', 4000);

  if (
    falhou(statusInformado) ||
    falhou(deckInformado) ||
    falhou(progressoInformado) ||
    falhou(notaInformada) ||
    falhou(anotacaoInformada)
  ) {
    const primeiro = [statusInformado, deckInformado, progressoInformado, notaInformada, anotacaoInformada].find(falhou);
    res.status(400).json({ erro: primeiro?.erro ?? 'Dados inválidos.' });
    return;
  }

  let deckGravado = deckInformado as string;
  let deckId: string | null = null;
  if (typeof req.body?.deck_id === 'string' && req.body.deck_id.trim()) {
    const encaixe = encaixar(userId, req.body.deck_id.trim(), nome, descricao);
    if ('erro' in encaixe) {
      res.status(400).json({ erro: encaixe.erro });
      return;
    }
    deckGravado = encaixe.deck;
    deckId = encaixe.deck_id;
  }

  const banco = obterBanco();
  const duplicado = banco
    .prepare('SELECT id FROM arquivos WHERE user_id = ? AND item_id = ?')
    .get(userId, itemId) as { id: string } | undefined;

  if (duplicado) {
    res.status(409).json({ erro: 'Essa carta já está em um deck.' });
    return;
  }

  const registro: ArquivoRegistro = {
    id: randomUUID(),
    user_id: userId,
    item_id: itemId,
    categoria,
    nome,
    imagem_url: imagem,
    descricao,
    status: statusInformado as StatusEstudo,
    progresso: progressoInformado,
    nota: notaInformada,
    anotacao: anotacaoInformada,
    deck: deckGravado,
    deck_id: deckId,
    updated_at: new Date().toISOString(),
  };

  banco
    .prepare(
      `INSERT INTO arquivos (
        id, user_id, item_id, categoria, nome, imagem_url, descricao, status, progresso, nota, anotacao, deck, deck_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      registro.id,
      registro.user_id,
      registro.item_id,
      registro.categoria,
      registro.nome,
      registro.imagem_url,
      registro.descricao,
      registro.status,
      registro.progresso,
      registro.nota,
      registro.anotacao,
      registro.deck,
      registro.deck_id,
      registro.updated_at,
    );

  res.status(201).json(arquivoPublico(registro));
}

export function atualizar(req: RequisicaoAutenticada, res: Response): void {
  const userId = exigirUsuario(req, res);
  if (!userId) return;

  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : '';
  if (!itemId) {
    res.status(400).json({ erro: 'item_id ausente.' });
    return;
  }

  const banco = obterBanco();
  const atual = banco
    .prepare('SELECT * FROM arquivos WHERE user_id = ? AND item_id = ?')
    .get(userId, itemId) as ArquivoRegistro | undefined;

  if (!atual) {
    res.status(404).json({ erro: 'Arquivo não encontrado no seu Holocron.' });
    return;
  }

  const corpo = req.body ?? {};
  const status = corpo.status === undefined ? atual.status : statusValido(corpo.status);
  let deck = corpo.deck === undefined ? atual.deck ?? 'avulso' : deckValido(corpo.deck);
  let deckId = atual.deck_id ?? null;
  const progresso = corpo.progresso === undefined ? atual.progresso : inteiroEntre(corpo.progresso, 'Progresso', 0, 100);
  const nota = corpo.nota === undefined ? atual.nota : inteiroEntre(corpo.nota, 'Nota', 0, 10);
  const anotacao =
    corpo.anotacao === undefined ? atual.anotacao : corpo.anotacao === '' ? '' : texto(corpo.anotacao, 'Anotação', 4000);

  if (typeof corpo.deck_id === 'string' && corpo.deck_id.trim()) {
    const encaixe = encaixar(userId, corpo.deck_id.trim(), atual.nome, atual.descricao);
    if ('erro' in encaixe) {
      res.status(400).json({ erro: encaixe.erro });
      return;
    }
    deck = encaixe.deck;
    deckId = encaixe.deck_id;
  } else if (corpo.deck_id === null || corpo.deck_id === '') {
    deckId = null;
  }

  if (falhou(status) || falhou(deck) || falhou(progresso) || falhou(nota) || falhou(anotacao)) {
    const primeiro = [status, deck, progresso, nota, anotacao].find(falhou);
    res.status(400).json({ erro: primeiro?.erro ?? 'Dados inválidos.' });
    return;
  }

  const updatedAt = new Date().toISOString();
  banco
    .prepare(
      `UPDATE arquivos
       SET status = ?, progresso = ?, nota = ?, anotacao = ?, deck = ?, deck_id = ?, updated_at = ?
       WHERE user_id = ? AND item_id = ?`,
    )
    .run(status, progresso, nota, anotacao, deck, deckId, updatedAt, userId, itemId);

  res.status(200).json(
    arquivoPublico({
      ...atual,
      status: status as string,
      progresso: progresso as number,
      nota: nota as number,
      anotacao: anotacao as string,
      deck: deck as string,
      deck_id: deckId,
      updated_at: updatedAt,
    }),
  );
}

export function remover(req: RequisicaoAutenticada, res: Response): void {
  const userId = exigirUsuario(req, res);
  if (!userId) return;

  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : '';
  const resultado = obterBanco()
    .prepare('DELETE FROM arquivos WHERE user_id = ? AND item_id = ?')
    .run(userId, itemId);

  if (resultado.changes === 0) {
    res.status(404).json({ erro: 'Arquivo não encontrado no seu Holocron.' });
    return;
  }

  res.status(200).json({ ok: true });
}
