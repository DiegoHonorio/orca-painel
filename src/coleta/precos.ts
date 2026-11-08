// Preço por milhão de tokens (API Anthropic, primeira parte). É uma ESTIMATIVA: num plano de
// assinatura (Pro/Max) você não paga por token, mas o número mostra o "valor" do que foi usado.
// Escrita de cache: 1,25x a entrada (5 min) e 2x (1 h). Leitura de cache: valor da tabela.

type Preco = { entrada: number; saida: number; leituraCache: number }

const TABELA: [RegExp, Preco][] = [
  [/fable-5|mythos-5/, { entrada: 10, saida: 50, leituraCache: 0.25 }],
  [/opus-5-5/, { entrada: 4, saida: 20, leituraCache: 0.2 }],
  [/opus-5|opus-4-[5-9]/, { entrada: 5, saida: 25, leituraCache: 0.5 }],
  [/opus-4|opus-3/, { entrada: 15, saida: 75, leituraCache: 1.5 }],
  [/sonnet-5/, { entrada: 2, saida: 10, leituraCache: 0.2 }],
  [/sonnet/, { entrada: 3, saida: 15, leituraCache: 0.3 }],
  [/haiku-5/, { entrada: 0.1, saida: 0.5, leituraCache: 0.01 }],
  [/haiku-4|haiku-3-5/, { entrada: 1, saida: 5, leituraCache: 0.1 }],
  [/haiku/, { entrada: 0.25, saida: 1.25, leituraCache: 0.03 }]
]

export type Uso = {
  entrada: number
  saida: number
  escritaCache5m: number
  escritaCache1h: number
  leituraCache: number
}

/** Custo estimado em US$, ou null quando o modelo não tem preço conhecido (ex.: Codex/GPT). */
export function custoEstimado(modelo: string, uso: Uso): number | null {
  const achado = TABELA.find(([padrao]) => padrao.test(modelo))
  if (!achado) return null
  const p = achado[1]
  const porMilhao =
    uso.entrada * p.entrada +
    uso.saida * p.saida +
    uso.escritaCache5m * p.entrada * 1.25 +
    uso.escritaCache1h * p.entrada * 2 +
    uso.leituraCache * p.leituraCache
  return porMilhao / 1_000_000
}
