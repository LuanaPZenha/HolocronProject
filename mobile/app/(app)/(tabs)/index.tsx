import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BannerOffline, EstadoErro, EstadoVazio } from '../../../components/Estados';
import { CampoBusca } from '../../../components/Campos';
import { CardEntrada } from '../../../components/CardEntrada';
import { FiltroCategoria } from '../../../components/FiltroCategoria';
import { PainelEstudo } from '../../../components/PainelEstudo';
import { fonte } from '../../../constants/theme';
import { useHolocron } from '../../../contexts/HolocronContext';
import { useColuna } from '../../../hooks/useColuna';
import { useOnline } from '../../../hooks/useOnline';
import { usePersistedState } from '../../../hooks/usePersistedState';
import { useTema } from '../../../hooks/useTema';
import { CHAVES } from '../../../services/chaves';
import { filtrarPorNome, indiceCategoria, listarPagina } from '../../../services/databank';
import { ladoDaCarta } from '../../../services/lado';
import {
  ROTULO_CATEGORIA,
  ehCategoria,
  type Categoria,
  type EntradaResumo,
  type UltimaLeitura,
} from '../../../types/starwars';

const VAZIO_ULTIMA: UltimaLeitura = { nome: '', categoria: 'characters' };

export default function Enciclopedia() {
  const tema = useTema();
  const online = useOnline();
  const { obter, decks } = useHolocron();
  const coluna = useColuna();
  const [categoriaBruta, definirCategoria] = usePersistedState<string>(CHAVES.categoria, 'characters');
  const [historico, definirHistorico] = usePersistedState<string[]>(CHAVES.buscas, []);
  const [ultima] = usePersistedState<UltimaLeitura>(CHAVES.ultima, VAZIO_ULTIMA);
  const categoria: Categoria = ehCategoria(categoriaBruta) ? categoriaBruta : 'characters';
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [itens, setItens] = useState<EntradaResumo[]>([]);
  const [acervo, setAcervo] = useState<EntradaResumo[]>([]);
  const categoriaVista = useRef(categoria);
  const [total, setTotal] = useState(0);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [modo, setModo] = useState<'pagina' | 'busca'>('pagina');
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const pedido = useRef(0);
  const trava = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setConsulta(texto.trim()), 500);
    return () => clearTimeout(id);
  }, [texto]);

  useEffect(() => {
    if (consulta.length < 2) {
      return;
    }
    definirHistorico((atual) => {
      const lista = Array.isArray(atual) ? atual.filter((item) => typeof item === 'string') : [];
      const sem = lista.filter((item) => item.toLowerCase() !== consulta.toLowerCase());
      return [consulta, ...sem].slice(0, 6);
    });
  }, [consulta, definirHistorico]);

  useEffect(() => {
    const ticket = ++pedido.current;
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro(null);
      setCarregandoMais(false);
      trava.current = false;
      if (categoriaVista.current !== categoria) {
        setItens([]);
        setAcervo([]);
        categoriaVista.current = categoria;
      }
      try {
        if (consulta) {
          const indice = await indiceCategoria(categoria);
          if (cancelado || ticket !== pedido.current) {
            return;
          }
          const filtrado = filtrarPorNome(indice, consulta);
          setAcervo(filtrado);
          setItens(filtrado.slice(0, 20));
          setTotal(filtrado.length);
          setTemMais(filtrado.length > 20);
          setModo('busca');
        } else {
          const pagina = await listarPagina(categoria, 1);
          if (cancelado || ticket !== pedido.current) {
            return;
          }
          setAcervo([]);
          setItens(pagina.data);
          setTotal(pagina.info.total);
          setPaginaAtual(1);
          setTemMais(Boolean(pagina.info.next));
          setModo('pagina');
        }
      } catch (falha) {
        if (cancelado || ticket !== pedido.current) {
          return;
        }
        setItens([]);
        setErro(falha instanceof Error ? falha.message : 'A enciclopédia não respondeu.');
      } finally {
        if (!cancelado && ticket === pedido.current) {
          setCarregando(false);
          setAtualizando(false);
        }
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [categoria, consulta, versao]);

  async function carregarMais() {
    if (trava.current || carregando || !temMais) {
      return;
    }
    trava.current = true;
    setCarregandoMais(true);
    try {
      if (modo === 'busca') {
        const proximo = itens.length + 20;
        setItens(acervo.slice(0, proximo));
        setTemMais(proximo < acervo.length);
      } else {
        const proxima = paginaAtual + 1;
        const pagina = await listarPagina(categoria, proxima);
        setItens((atual) => {
          const ids = new Set(atual.map((item) => item._id));
          return [...atual, ...pagina.data.filter((item) => !ids.has(item._id))];
        });
        setPaginaAtual(proxima);
        setTemMais(Boolean(pagina.info.next));
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar mais fichas.');
    } finally {
      trava.current = false;
      setCarregandoMais(false);
    }
  }

  function abrir(item: EntradaResumo) {
    router.push({
      pathname: '/(app)/entrada/[categoria]/[id]',
      params: { categoria, id: item._id },
    });
  }

  const buscas = Array.isArray(historico) ? historico.filter((item) => typeof item === 'string') : [];
  const linhaUltima = ultima && typeof ultima.nome === 'string' && ultima.nome ? ultima.nome : 'Nenhuma ficha aberta ainda';

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <BannerOffline visivel={!online} />
      <FlatList
        style={estilos.lista}
        contentContainerStyle={[estilos.conteudo, coluna]}
        data={itens}
        keyExtractor={(item) => String(item._id)}
        ItemSeparatorComponent={Separador}
        refreshing={atualizando}
        onRefresh={() => {
          setAtualizando(true);
          setVersao((valor) => valor + 1);
        }}
        onEndReached={() => {
          void carregarMais();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <PainelEstudo
            titulo={ROTULO_CATEGORIA[categoria]}
            linha={linhaUltima}
            contagem={carregando && itens.length === 0 ? '—' : String(total)}
          >
            <CampoBusca valor={texto} onChangeText={setTexto} />
            {texto.length === 0 && buscas.length > 0 ? (
              <View style={estilos.historico}>
                {buscas.map((busca) => (
                  <Pressable key={busca} accessibilityRole="button" onPress={() => setTexto(busca)}>
                    <Text style={[estilos.chip, { color: tema.tinta, borderColor: tema.tintaFraca }]}>{busca}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <FiltroCategoria ativa={categoria} onMudar={definirCategoria} />
          </PainelEstudo>
        }
        ListEmptyComponent={
          carregando ? (
            <ActivityIndicator color={tema.tinta} style={estilos.espera} />
          ) : erro ? (
            <EstadoErro mensagem={erro} onTentar={() => setVersao((valor) => valor + 1)} />
          ) : (
            <EstadoVazio
              mensagem={
                consulta
                  ? 'Nenhuma entrada com esse nome nesta categoria.'
                  : 'Esta categoria ainda não devolveu fichas.'
              }
            />
          )
        }
        ListFooterComponent={
          carregandoMais ? <ActivityIndicator color={tema.tinta} style={estilos.espera} /> : <View style={estilos.rodape} />
        }
        renderItem={({ item }) => {
          const salvo = obter(item._id);
          const ladoSalvo = salvo && salvo.deck !== 'avulso' ? salvo.deck : null;
          const lado = ladoSalvo ?? ladoDaCarta(`${item.name}\n${item.description}`);
          return (
            <CardEntrada
              nome={item.name}
              descricao={item.description}
              imagem={item.image}
              categoria={categoria}
              deck={lado ?? undefined}
              nomeDeck={decks.find((baralho) => baralho.id === salvo?.deck_id)?.nome}
              status={salvo?.status}
              nota={salvo?.nota}
              onPress={() => abrir(item)}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

function Separador() {
  return <View style={estilos.separador} />;
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
  },
  lista: {
    flex: 1,
  },
  conteudo: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  separador: {
    height: 8,
  },
  espera: {
    marginVertical: 24,
  },
  rodape: {
    height: 8,
  },
  historico: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    fontFamily: fonte.mono,
    fontSize: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
