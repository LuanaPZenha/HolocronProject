import {
  starWarsApi,
  swapi,
} from './starWarsApi';
import { comCache } from './cache';
import type {
  Categoria,
  EntradaResumo,
  FichaTecnica,
  PaginaDatabank,
} from '../types/starwars';

const LIMITE = 20;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function resumir(valor: unknown): EntradaResumo | null {
  if (!valor || typeof valor !== 'object') {
    return null;
  }
  const bruto = valor as Record<string, unknown>;
  if (typeof bruto._id !== 'string' || typeof bruto.name !== 'string') {
    return null;
  }
  return {
    _id: bruto._id,
    name: bruto.name,
    description: texto(bruto.description),
    image: texto(bruto.image),
  };
}

function paginaDe(valor: unknown, page: number): PaginaDatabank {
  if (Array.isArray(valor)) {
    const data = valor.map(resumir).filter((item): item is EntradaResumo => item !== null);
    return { info: { total: data.length, page, next: null, prev: null }, data };
  }

  if (!valor || typeof valor !== 'object') {
    throw new Error('A enciclopédia devolveu um formato inesperado.');
  }

  const bruto = valor as Record<string, unknown>;
  const lista = Array.isArray(bruto.data) ? bruto.data : [];
  const info = bruto.info && typeof bruto.info === 'object' ? (bruto.info as Record<string, unknown>) : {};
  const data = lista.map(resumir).filter((item): item is EntradaResumo => item !== null);

  return {
    info: {
      total: typeof info.total === 'number' ? info.total : data.length,
      page: typeof info.page === 'number' ? info.page : page,
      next: typeof info.next === 'string' ? info.next : null,
      prev: typeof info.prev === 'string' ? info.prev : null,
    },
    data,
  };
}

async function pedir(caminho: string, params?: Record<string, string | number>): Promise<unknown> {
  try {
    const resposta = await starWarsApi.get<unknown>(caminho, { params });
    return resposta.data;
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith('A enciclopédia')) {
      throw erro;
    }
    throw new Error('A enciclopédia não respondeu.');
  }
}

export async function listarPagina(categoria: Categoria, page: number): Promise<PaginaDatabank> {
  return comCache(`pagina_${categoria}_${page}`, async () => {
    const dados = await pedir(`/${categoria}`, { page, limit: LIMITE });
    return paginaDe(dados, page);
  });
}

export async function indiceCategoria(categoria: Categoria): Promise<EntradaResumo[]> {
  return comCache(`indice_${categoria}`, async () => {
    const primeira = paginaDe(await pedir(`/${categoria}`, { page: 1, limit: 100 }), 1);
    const total = primeira.info.total > 0 ? primeira.info.total : primeira.data.length;
    const paginas = Math.min(40, Math.max(1, Math.ceil(total / 100)));
    const restantes =
      paginas === 1
        ? []
        : await Promise.all(
            Array.from({ length: paginas - 1 }, (_, indice) =>
              pedir(`/${categoria}`, { page: indice + 2, limit: 100 }).then((dados) => paginaDe(dados, indice + 2)),
            ),
          );

    const vistos = new Set<string>();
    const todos: EntradaResumo[] = [];
    for (const item of [primeira, ...restantes].flatMap((pagina) => pagina.data)) {
      if (vistos.has(item._id)) {
        continue;
      }
      vistos.add(item._id);
      todos.push(item);
    }
    return todos;
  });
}

export function filtrarPorNome(lista: EntradaResumo[], consulta: string): EntradaResumo[] {
  const termo = consulta.trim().toLowerCase();
  if (!termo) {
    return lista;
  }
  return lista.filter((item) => item.name.toLowerCase().includes(termo));
}

export async function obterEntrada(categoria: Categoria, id: string): Promise<EntradaResumo> {
  return comCache(`entrada_${categoria}_${id}`, async () => {
    const dados = await pedir(`/${categoria}/${encodeURIComponent(id)}`);
    const entrada = resumir(dados);
    if (!entrada) {
      throw new Error('Essa ficha não está na enciclopédia.');
    }
    return entrada;
  });
}

function util(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }
  const limpo = valor.trim();
  if (!limpo || limpo.toLowerCase() === 'unknown' || limpo.toLowerCase() === 'n/a') {
    return null;
  }
  return limpo;
}

const TRADUCAO: Record<string, string> = {
  male: 'masculino',
  female: 'feminino',
  hermaphrodite: 'hermafrodita',
  none: 'nenhum',
  blond: 'loiro',
  blonde: 'loira',
  fair: 'clara',
  light: 'clara',
  blue: 'azul',
  brown: 'castanho',
  black: 'preto',
  white: 'branco',
  green: 'verde',
  yellow: 'amarelo',
  red: 'vermelho',
  grey: 'cinza',
  gray: 'cinza',
  hazel: 'avelã',
  orange: 'laranja',
  pink: 'rosa',
  gold: 'dourado',
  pale: 'pálida',
  tan: 'bronzeada',
  dark: 'escura',
  metal: 'metálico',
  arid: 'árido',
  temperate: 'temperado',
  tropical: 'tropical',
  frozen: 'congelado',
  murky: 'turvo',
  hot: 'quente',
  humid: 'úmido',
  windy: 'ventoso',
  desert: 'deserto',
  deserts: 'desertos',
  grasslands: 'campos',
  mountains: 'montanhas',
  jungle: 'selva',
  jungles: 'selvas',
  rainforests: 'floresta tropical',
  ocean: 'oceano',
  oceans: 'oceanos',
  tundra: 'tundra',
  ice: 'gelo',
  'ice caves': 'cavernas de gelo',
  cityscape: 'urbano',
  swamp: 'pântano',
  swamps: 'pântanos',
  rocky: 'rochoso',
  barren: 'estéril',
  forests: 'florestas',
  lakes: 'lagos',
  grassy: 'gramado',
  hills: 'colinas',
  mammal: 'mamífero',
  mammals: 'mamíferos',
  reptile: 'réptil',
  reptilian: 'reptiliano',
  amphibian: 'anfíbio',
  insectoid: 'insetoide',
  sentient: 'senciente',
  artificial: 'artificial',
  gastropod: 'gastrópode',
  standard: 'padrão',
};

const ROTULO_CAMPO: Record<string, string> = {
  height: 'Altura',
  mass: 'Massa',
  hair_color: 'Cabelo',
  skin_color: 'Pele',
  eye_color: 'Olhos',
  birth_year: 'Nascimento',
  gender: 'Gênero',
  homeworld: 'Planeta natal',
  films: 'Filmes',
  species: 'Espécie',
  vehicles: 'Veículos',
  starships: 'Naves',
  rotation_period: 'Rotação',
  orbital_period: 'Órbita',
  diameter: 'Diâmetro',
  climate: 'Clima',
  gravity: 'Gravidade',
  terrain: 'Terreno',
  surface_water: 'Água na superfície',
  population: 'População',
  residents: 'Habitantes',
  classification: 'Classificação',
  designation: 'Designação',
  average_height: 'Altura média',
  average_lifespan: 'Expectativa de vida',
  language: 'Idioma',
  skin_colors: 'Peles',
  hair_colors: 'Cabelos',
  eye_colors: 'Olhos',
  people: 'Pessoas',
  model: 'Modelo',
  manufacturer: 'Fabricante',
  cost_in_credits: 'Custo',
  length: 'Comprimento',
  max_atmosphering_speed: 'Velocidade máxima',
  crew: 'Tripulação',
  passengers: 'Passageiros',
  cargo_capacity: 'Carga',
  consumables: 'Suprimentos',
  hyperdrive_rating: 'Hiperpropulsor',
  MGLT: 'MGLT',
  starship_class: 'Classe',
  vehicle_class: 'Classe',
  pilots: 'Pilotos',
};

const ORDEM: Record<string, string[]> = {
  people: ['height', 'mass', 'hair_color', 'skin_color', 'eye_color', 'birth_year', 'gender', 'homeworld', 'species', 'films', 'vehicles', 'starships'],
  planets: ['rotation_period', 'orbital_period', 'diameter', 'climate', 'gravity', 'terrain', 'surface_water', 'population', 'residents', 'films'],
  species: ['classification', 'designation', 'average_height', 'average_lifespan', 'language', 'skin_colors', 'hair_colors', 'eye_colors', 'homeworld', 'people', 'films'],
  starships: ['model', 'manufacturer', 'cost_in_credits', 'length', 'max_atmosphering_speed', 'crew', 'passengers', 'cargo_capacity', 'consumables', 'hyperdrive_rating', 'MGLT', 'starship_class', 'pilots', 'films'],
  vehicles: ['model', 'manufacturer', 'cost_in_credits', 'length', 'max_atmosphering_speed', 'crew', 'passengers', 'cargo_capacity', 'consumables', 'vehicle_class', 'pilots', 'films'],
};

const IGNORAR = new Set(['name', 'created', 'edited', 'url', 'title']);
const nomesRelacionados = new Map<string, string | null>();

function traduzir(valor: string): string {
  return valor
    .split(',')
    .map((parte) => {
      const limpo = parte.trim();
      const chave = limpo.toLowerCase();
      if (chave in TRADUCAO) {
        return TRADUCAO[chave];
      }
      return limpo;
    })
    .filter((parte) => parte.length > 0)
    .join(', ');
}

function ano(valor: string): string {
  const lido = valor.trim().match(/^([\d.]+)\s*(BBY|ABY)$/i);
  if (!lido) {
    return valor;
  }
  const quando = lido[2].toUpperCase() === 'BBY' ? 'antes da Batalha de Yavin' : 'depois da Batalha de Yavin';
  return `${lido[1]} ${quando}`;
}

function comUnidade(campo: string, valor: string): string {
  if (campo === 'height' || campo === 'average_height') {
    return `${valor} cm`;
  }
  if (campo === 'mass') {
    return `${valor} kg`;
  }
  if (campo === 'diameter') {
    return `${valor} km`;
  }
  if (campo === 'length') {
    return `${valor} m`;
  }
  if (campo === 'rotation_period') {
    return `${valor} h`;
  }
  if (campo === 'orbital_period') {
    return `${valor} dias`;
  }
  if (campo === 'average_lifespan') {
    return `${valor} anos`;
  }
  if (campo === 'cargo_capacity') {
    return `${valor} kg`;
  }
  if (campo === 'cost_in_credits') {
    return `${valor} créditos`;
  }
  if (campo === 'max_atmosphering_speed') {
    return `${valor} km/h`;
  }
  if (campo === 'surface_water') {
    return `${valor}%`;
  }
  if (campo === 'birth_year') {
    return ano(valor);
  }
  if (campo === 'population' && /^\d+$/.test(valor)) {
    return Number(valor).toLocaleString('pt-BR');
  }
  return traduzir(valor);
}

async function nomeDe(url: string): Promise<string | null> {
  if (nomesRelacionados.has(url)) {
    return nomesRelacionados.get(url) ?? null;
  }
  try {
    const resposta = await swapi.get<unknown>(url);
    const dados = resposta.data;
    const nome =
      dados && typeof dados === 'object'
        ? util((dados as { title?: unknown; name?: unknown }).title) ?? util((dados as { name?: unknown }).name)
        : null;
    nomesRelacionados.set(url, nome);
    return nome;
  } catch {
    nomesRelacionados.set(url, null);
    return null;
  }
}

async function valorCampo(campo: string, bruto: unknown): Promise<string | null> {
  if (Array.isArray(bruto)) {
    const urls = bruto.filter((item): item is string => typeof item === 'string' && item.startsWith('http'));
    if (urls.length === 0) {
      return null;
    }
    const nomes = (await Promise.all(urls.map((url) => nomeDe(url)))).filter((item): item is string => Boolean(item));
    return nomes.length > 0 ? nomes.join(', ') : null;
  }
  if (typeof bruto === 'string' && bruto.startsWith('http')) {
    return nomeDe(bruto);
  }
  const textoValor = util(bruto);
  return textoValor ? comUnidade(campo, textoValor) : null;
}

async function linhasDe(recurso: string, item: Record<string, unknown>): Promise<FichaTecnica['linhas']> {
  const ordem = ORDEM[recurso] ?? [];
  const chaves = [...ordem, ...Object.keys(item).filter((chave) => !ordem.includes(chave) && !IGNORAR.has(chave))];
  const linhas: FichaTecnica['linhas'] = [];
  for (const campo of chaves) {
    if (IGNORAR.has(campo) || !(campo in item)) {
      continue;
    }
    const valor = await valorCampo(campo, item[campo]);
    if (!valor) {
      continue;
    }
    linhas.push({ rotulo: ROTULO_CAMPO[campo] ?? campo, valor });
  }
  return linhas;
}

async function buscarRecurso(recurso: string, nome: string): Promise<Record<string, unknown> | null> {
  const resposta = await swapi.get<unknown>(`/${recurso}/`, { params: { search: nome } });
  const dados = resposta.data;
  if (!dados || typeof dados !== 'object' || !('results' in dados)) {
    return null;
  }
  const results = (dados as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return null;
  }
  const alvo = nome.trim().toLowerCase();
  for (const item of results) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const registro = item as Record<string, unknown>;
    if (typeof registro.name === 'string' && registro.name.trim().toLowerCase() === alvo) {
      return registro;
    }
  }
  return null;
}

export async function complementoSwapi(categoria: Categoria, nome: string): Promise<FichaTecnica | null> {
  const recursos =
    categoria === 'characters' || categoria === 'droids'
      ? ['people']
      : categoria === 'locations'
        ? ['planets']
        : categoria === 'species' || categoria === 'creatures'
          ? ['species']
          : categoria === 'vehicles'
            ? ['starships', 'vehicles']
            : [];

  if (recursos.length === 0) {
    return null;
  }

  try {
    for (const recurso of recursos) {
      const item = await buscarRecurso(recurso, nome);
      if (!item) {
        continue;
      }
      const linhas = await linhasDe(recurso, item);
      if (linhas.length === 0) {
        continue;
      }
      const origem = 'Dados';
      return { origem, linhas };
    }
    return null;
  } catch {
    return null;
  }
}
