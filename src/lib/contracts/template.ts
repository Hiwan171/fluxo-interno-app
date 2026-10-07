/**
 * Modelo "Contrato de prestação de serviço para realização da coleta dos
 * resíduos de serviço de saúde", comum às empresas Ambientec, Colemax,
 * Colenorte e Biocoletas.
 *
 * O texto das cláusulas foi extraído dos contratos reais (PDF) e é conteúdo
 * jurídico: **não corrigir redação aqui sem aval do jurídico**, mesmo onde há
 * erro evidente de português ("clausula", "afim de", "quem venham"). O que
 * muda de uma empresa para outra fica em `companies.ts`; o que muda de um
 * cliente para outro entra pelos marcadores abaixo.
 *
 * Marcação do texto:
 * - `**negrito**`, `__itálico__` e `[[link]]`;
 * - `{{campo}}` — valor do contrato, inserido como texto puro (marcação
 *   digitada pelo usuário é neutralizada);
 * - `{{{campo}}}` — trecho já com marcação, só para valores montados no código.
 */

export type TemplateBlock =
  | { kind: "heading"; text: string }
  | {
      kind: "item";
      /** Número da cláusula, colocado numa coluna à esquerda do texto. */
      num?: string;
      text: string;
      /** Recuo de sub-item sem número ("i)", "ii)"). */
      indent?: boolean;
      /** Bloco só entra no contrato quando o campo correspondente está marcado. */
      only?: "coletaAnimais";
    }
  | { kind: "table"; rows: ReadonlyArray<readonly [string, string]> };

export const CONTRACT_TITLE =
  "CONTRATO DE PRESTAÇÃO DE SERVIÇO PARA REALIZAÇÃO DA COLETA DOS RESÍDUOS DE SERVIÇO DE SAÚDE";

export const CONTRACT_BLOCKS: ReadonlyArray<TemplateBlock> = [
  { kind: "heading", text: "CLÁUSULA PRIMEIRA – OBJETO DO CONTRATO" },
  { kind: "item", num: "1.1", text: "O presente Contrato tem por objeto a prestação de serviço de coleta, transporte, tratamento e destinação final dos resíduos do serviço de saúde classificados {{{grupos}}}, gerados em estabelecimentos do contratante pela contratada." },
  { kind: "item", num: "1.1.1", text: "Fica estabelecido que o objeto do presente Contrato não se caracterizará em hipótese alguma em cessão de mão de obra, uma vez não haverá transferência de subordinação para a CONTRATADA dos funcionários da CONTRATANTE." },
  { kind: "item", num: "1.1.2", text: "Os valores contidos na clausula de preço serão cobrados independente de geração de resíduos ou mesmo não atingindo o mínimo de resíduos previsto neste contrato para a realização da coleta." },
  { kind: "item", text: "“Além do serviço explicitado no item 1.1, o contrato também tem como objeto a manutenção de toda documentação necessária para a execução do presente instrumento, bem como licenças, declarações e qualquer outro necessário para execução do serviço contratado.”" },
  { kind: "item", num: "1.2", text: "A coleta será realizada em locais designados pela contratante, obedecendo à frequência **{{frequencia}}** sendo os resíduos levados para locais licenciados para tratamento ou disposição final pelos órgãos ambientais." },
  { kind: "item", num: "1.3", text: "Caso haja inclusão de novos pontos de coleta, ou coletas extras pela Empresa Contratante, a Empresa Contratada deverá ser comunicada com **48 (Quarenta e oito horas)** de antecedência." },
  { kind: "item", num: "1.4", text: "Na portaria da Contratante será respeitado o tempo de espera de 30 (trinta) minutos. Ultrapassando tal tempo será acrescida a mensalidade referente a tal coleta o valor de **R$50,00 (Cinquenta Reais)** por cada fração de 15 minutos." },
  { kind: "item", num: "1.4.1", text: "A Comprovação da prestação dos serviços inerentes a esse contrato, serão efetivamente comprovados, através da apresentação do comprovante de pagamento e do certificado de destinação final do mês corrente." },
  { kind: "item", num: "1.5", text: "__De acordo com o decreto 12.165, a resolução da Agência de Vigilância Sanitária ANVISA – RDC 222/2018, e RDC 358/2005 do Conselho Nacional de Meio Ambiente – CONAMA:__" },
  { kind: "item", text: "__Lei 12.305/2010. Art. 27 § 1. A contratação de serviços de coleta, armazenamento, transporte, transbordo, tratamento ou destinação final de resíduos sólidos, ou de disposição final de rejeitos, não isenta as pessoas físicas ou jurídicas referidas no art. 20 da responsabilidade por danos que vierem a ser provocados pelo gerenciamento inadequado dos respectivos resíduos ou rejeitos.__" },
  { kind: "item", num: "1.5.1", text: "As coletas serão realizadas dentro do horário comercial: **08:00 às {{horarioFim}}**, respeitando-se o horário de almoço de **12:00 às 13:00 horas.**" },
  { kind: "item", num: "1.5.2", text: "Quaisquer adequações com relação ao horário de coleta e acesso aos resíduos deverão ser realizadas mediante solicitação (e-mail) formal e aceito por ambas as partes." },
  { kind: "item", num: "1.5.3", text: "Os resíduos deverão estar em local de fácil acesso e acondicionados corretamente." },
  { kind: "heading", text: "CLÁUSULA SEGUNDA – OBRIGAÇÕES DA CONTRATADA" },
  { kind: "item", num: "2.1", text: "São obrigações da Contratada:" },
  { kind: "item", num: "2.1.1", text: "Sempre que necessário, a Contratada deverá disponibilizar todas as licenças de funcionamento, assim como as licenças de terceiros que participarem do processo em geral." },
  { kind: "item", num: "2.1.2", text: "Cumprir e fazer com que seus funcionários respeitem, as Normas de Segurança do Trabalho previstas na portaria n. 3124, de 08/06/1978, do Ministério do Trabalho e NBR n. 12810." },
  { kind: "item", num: "2.1.3", text: "Fornecer veículo apropriado e pessoal devidamente treinado para realização das atividades presentes no objetivo desse contrato, bem como os equipamentos de proteção individual inerente aos exercícios desse tipo de atividade." },
  { kind: "item", num: "2.1.4", text: "Responsabilizar-se pelo recolhimento de todos os encargos decorrentes de Leis Trabalhistas, sociais relativas ao seu pessoal e a este contrato, além de responsabilizar-se pelo recolhimento dos encargos Fiscais, Estaduais, Federais e Municipais inerentes a esse contrato." },
  { kind: "item", num: "2.1.5", text: "Procurar a Contratante para acertar os preços dos serviços não previstos que vierem a surgir." },
  { kind: "item", num: "2.1.6", text: "De acordo com o Código Civil Brasileiro, é de responsabilidade exclusiva da Contratada, se for diagnosticado culpa, quando da execução dos serviços previstos neste contrato, seja através de erros, falha e/ou omissões, acidentes, devendo repará-los sem quaisquer ônus à Contratante ou a terceiros que possam vir a ser prejudicados." },
  { kind: "item", num: "2.1.7", text: "– Também segundo o Código Civil Brasileiro, a Contratada será a responsável pelo inadimplemento de suas obrigações conforme dispõe os art. 389, 392 e 475, exceto na ocorrência de caso fortuito e/ou força maior, nos termos do art. 393 do referido Código." },
  { kind: "item", num: "2.1.8", text: "A Contratada se responsabiliza a responder e obedecer às determinações legais ou emanadas por autoridades competentes, em particular de meio ambiente, segurança e saúde ocupacional." },
  { kind: "heading", text: "CLÁUSULA TERCEIRA – OBRIGAÇÕES DA CONTRATANTE" },
  { kind: "item", num: "3.1", text: "São obrigações da Contratante:" },
  { kind: "item", num: "3.1.1", text: "Acondicionar os resíduos de forma adequada e suficiente, bem como utilizar recipientes normatizados para manuseio e transporte (bombonas normatizadas e paletizados)." },
  { kind: "item", num: "3.1.2", text: "Estabelecer o local onde a coleta dos resíduos deverá ser realizada, deixando essa a área desimpedida livre e de fácil acesso, possibilitando que a equipe da empresa Contratada possa realizar a coleta com segurança." },
  { kind: "item", num: "3.1.3", text: "Disponibilizar um responsável técnico para acompanhar as atividades que ocorrerem nas instalações internas / externas." },
  { kind: "item", num: "3.1.4", text: "A Contratante se responsabiliza a responder e obedecer às determinações legais ou emanadas por autoridades competentes, em particular de meio ambiente, segurança e saúde ocupacional. Quando necessário, também é de responsabilidade da mesma das devidas providências necessárias e pelos efeitos decorrentes de eventuais inobservâncias delas." },
  { kind: "item", num: "3.1.5", text: "É de responsabilidade da Contratante providenciar os seguintes documentos e procedimentos, quando necessário:" },
  { kind: "item", num: "3.1.5.1", text: "MTR – Manifesto para transportes de resíduos perigosos;" },
  { kind: "item", num: "3.1.5.2", text: "Resíduos químicos **(FISPQ)** ou laudo técnico de caracterização do resíduo;" },
  { kind: "item", num: "3.1.6", text: "Efetuar os pagamentos de acordo com as condições estabelecidas no presente contrato." },
  { kind: "item", num: "3.1.7", text: "O **Boleto e Nota fiscal** para pagamento estarão disponíveis antes do vencimento no site da **CONTRATADA**. Será de responsabilidade de a **CONTRATANTE** imprimir o referido documento para que seja feito o pagamento na rede bancária." },
  { kind: "item", num: "3.1.7.1", text: "A **CONTRATADA** se exime da remessa dos citados documentos, vez que todo o processamento dos serviços ora contratados será efetuado, unicamente, por meio eletrônico." },
  { kind: "item", num: "3.1.7.2", text: "O Certificado de Destinação Final estarão disponíveis no site da **FEAM** Fundação estadual do meio ambiente [[https://mtr.meioambiente.mg.gov.br/]]" },
  { kind: "heading", text: "CLÁUSULA QUARTA – PREÇO" },
  { kind: "item", num: "4.1", text: "– O serviço de coleta será realizado ao preço de **{{mensalidade}}** por mês, considerando a quantia de até **{{franquia}}** de resíduo por mês, condicionados a {{acondicionamento}} por coleta. **A cobrança será realizada mensalmente, sendo o primeiro pagamento no mês seguinte após a emissão do contrato**." },
  { kind: "item", num: "4.2", text: "– Para quantidades de resíduos superiores à estipulada no item **4.1** desse contrato, será cobrado o valor de **{{excedente}}** por cada quilo excedente sem desconto." },
  { kind: "item", num: "4.3", text: "– Em caso de descarte de resíduos como lâmpadas, pilhas, baterias e aerossol será cobrado conforme tabela abaixo:" },
  {
    kind: "table",
    rows: [
      ["Lâmpadas inteiras", "**R$ 4,50 (Quatro Reais e Cinquenta Centavos)** por unidade."],
      ["Lâmpadas quebradas", "**R$14,00 (Quatorze Reais)** por kg."],
      ["Pilhas e baterias", "**R$16,00 (Dezesseis Reais)** por kg."],
      ["Aerossol", "**R$18,00 (Dezoito Reais)** por kg."],
    ],
  },
  { kind: "item", num: "4.4", text: "– A entrega do certificado constado na clausula oitava deste, fica condicionada a quitação dos valores referente aos serviços prestados." },
  { kind: "item", num: "4.5", text: "– Para coleta avulsa de animais será cobrado o valor de **R$9,00 (Nove Reais)** por kg, respeitando um faturamento mínimo de **10(Dez) quilos por animal**.", only: "coletaAnimais" },
  { kind: "heading", text: "CLÁUSULA QUINTA – PAGAMENTOS" },
  { kind: "item", num: "5.1", text: "O boleto estará disponível 10 (dez) dias antes da data de seu vencimento na área do cliente no site da **{{siteDoBoleto}}**. O pagamento será efetuado por boleto bancário ou deposito em conta corrente indicado pela Contratada." },
  { kind: "item", num: "5.2", text: "No caso de atraso, os pagamentos realizados em atraso pela **CONTRATANTE** serão acrescidos de juros de mora de **0,33% (Zero vírgula Trinta e Três por cento)** ao {{jurosPeriodo}}, calculado pro rata die, e multa por atraso de **2%** sobre o valor da fatura em atraso, sem prejuízo do protesto do título respectivo e inclusão do nome do devedor em cadastros restritivos de crédito se, depois de notificada a respeito do atraso, a **CONTRATANTE** não corrigir suas obrigações no prazo de 30 dias." },
  { kind: "item", num: "5.3", text: "Eventual cobrança extrajudicial ou judicial efetuada por advogado será acrescida de 20% de honorários advocatícios sobre o valor da dívida." },
  { kind: "heading", text: "CLÁUSULA SEXTA – MEIO AMBIENTE" },
  { kind: "item", num: "6.1", text: "Visto a necessidade de uma preocupação cada vez maior com o Meio ambiente, as partes comprometem-se a zelar pela preservação dele deste, através de atitudes quem venham a minimizar ao máximo a agressão à natureza." },
  { kind: "item", num: "6.2", text: "Sempre que possível será utilizado e praticado os 3R’s (Reduzir, Reaproveitar e Reciclar), para uma melhor qualidade do ambiente." },
  { kind: "item", num: "6.3", text: "Além de colocar em prática os 3R’s ambas as partes deste contrato se comprometem a agir com Responsabilidade Ambiental para que seja garantido o direito das gerações futuras de usufruir dos recursos naturais." },
  { kind: "heading", text: "CLÁUSULA SÉTIMA – RESPONSABILIDADE SOCIAL" },
  { kind: "item", num: "7.1", text: "– As partes se comprometem a:" },
  { kind: "item", num: "7.1.1", text: "- Respeitar e fazer cumprir todas as disposições da legislação ambiental vigente, responsabilizando-se perante a outra parte, os órgãos ambientais e a sociedade, por todo e qualquer dano ou prejuízo que porventura causado ao meio ambiente." },
  { kind: "item", num: "7.1.2", text: "– Proteger e preservar o meio ambiente, bem como a executar seus serviços respeitando os atos legais, normativos, administrativos e correlatos, emanados das esferas Federal, Estaduais e Municipais, incluindo, mas não limitando ao cumprimento da Lei Federal n.º6.938/81 (Política Nacional do Meio Ambiente) e da Lei n. º9.605/98 (Lei dos Crimes Ambientais), implementando ainda, esforços nesse sentido junto aos seus respectivos colaboradores de produtos e serviços, a fim de que, esses também se comprometam a conjugar esforços para proteger e preservar o meio ambiente, em como se prevenir contra práticas danosas a este." },
  { kind: "item", num: "7.1.3", text: "– Não empregar trabalhadores menores de dezesseis anos de idade, salvo na condição de aprendiz a partir de quatorze anos, nos termos da Lei Federal n. º10.097 de 19.12.2000 e da Consolidação das Leis do Trabalho e demais legislações que regem a matéria." },
  { kind: "item", num: "7.1.4", text: "– Não empregar adolescentes até 18 anos de idade, em locais prejudiciais a sua formação, ao seu desenvolvimento físico, psíquico, moral e social, bem como em locais e serviços perigosos ou insalubres, em horários que não permitam a frequência à escola e ainda, em horários noturnos, de acordo com a legislação específica." },
  { kind: "item", num: "7.1.5", text: "– Não adotar práticas de trabalho análogo ao escravo e trabalho ilegal de crianças e adolescentes no cumprimento do presente contrato." },
  { kind: "heading", text: "CLÁUSULA OITAVA – TRATAMENTO DOS RESÍDUOS" },
  { kind: "item", num: "8.1", text: "Os resíduos serão coletados e transportados pela empresa **CONTRATADA**, e destinados as unidades de tratamentos licenciadas, onde será realizado o tratamento exigido pelos órgãos de fiscalização competentes. A certificação do presente serviço, quando houver, estará disponível no site da **FEAM** Fundação Estadual do Meio Ambiente constado na clausula terceira." },
  { kind: "heading", text: "CLÁUSULA NONA – REAJUSTAMENTO DE PREÇOS" },
  { kind: "item", num: "9.1", text: "Haverá reajustamento dos preços sempre que a legislação vigente permitir. Os preços serão reajustados anualmente de acordo com o Índice **IGP-M** divulgado pela Fundação Getúlio Vargas (FGV)." },
  { kind: "heading", text: "CLÁUSULA DÉCIMA – DA RESCISÃO E SUSPENSÃO DO SERVIÇO" },
  { kind: "item", num: "10.1", text: "A rescisão do presente contrato poderá ser feita através de comunicação por escrito até 30 dias antes do vencimento." },
  { kind: "item", num: "10.2", text: "O presente contrato poderá ser rescindido, por culpa do Contratante, independentemente de notificação prévia, caso ele incorra em inadimplência, falência ou em recuperação judicial." },
  { kind: "item", num: "10.2.1", text: "A **CONTRATADA** se reserva ao direito de paralisar, independentemente de interpelação judicial ou extrajudicial, os serviços objetos deste **INSTRUMENTO** em caso de inadimplência da **CONTRATANTE.**" },
  { kind: "item", num: "10.3", text: "O contrato será rescindido caso a Contratante incorra em mora superior a trinta dias." },
  { kind: "item", num: "10.4.", text: "Caso ocorra cancelamento do contrato durante o prazo de vigência, fica a parte que solicitar o cancelamento sujeita à multa no valor dos três últimos meses faturados." },
  { kind: "item", num: "10.4.1", text: "Caso não seja possível apurar as três últimas faturas, será devida a multa correspondente a três vezes a última fatura." },
  { kind: "item", num: "10.5", text: "O atraso de pagamento pela Empresa contratante por um prazo de quinze dias implicará na suspensão automática dos serviços sem a perda do direito de recebimento dos valores mensais." },
  { kind: "item", num: "10.6", text: "A rescisão do presente contrato poderá ocorrer a qualquer momento, caso ocorra descumprimento de qualquer cláusula do presente contrato, por ambas as partes." },
  { kind: "heading", text: "CLÁUSULA DÉCIMA PRIMEIRA – DO PRAZO" },
  { kind: "item", num: "11.", text: "Caso nenhuma parte se manifeste contra, com no mínimo 30 (trinta) dias de antecedência, esse contrato tem validade de 12 (doze) meses, a partir de sua assinatura, e se renovará automaticamente." },
  { kind: "heading", text: "CLÁUSULA DÉCIMA SEGUNDA – DO FORO" },
  { kind: "item", num: "12.1", text: "Para solução dos problemas que vierem a surgir em virtude do presente contrato, fica eleito o Foro de **{{foro}}.**" },
  { kind: "item", num: "12.2", text: "Para que se produzam os efeitos legais, esse contrato foi lavrado em forma digital, com todos efeito legais e de segurança composto de 13 (Treze) Cláusulas e vão assinado e rubricado em todas as páginas." },
  { kind: "heading", text: "CLÁUSULA DÉCIMA TERCEIRA – DA PROTEÇÃO DE DADOS" },
  { kind: "item", num: "13.1", text: "A **CONTRATADA**, por si e por seus colaboradores, obriga-se a atuar no presente Contrato em conformidade com a Legislação vigente sobre Proteção de Dados Pessoais e as determinações de órgãos reguladores/fiscalizadores sobre a matéria, em especial a Lei 13.709/2018, além das demais normas e políticas de proteção de dados de cada país onde houver qualquer tipo de tratamento dos dados dos clientes, o que inclui os dados dos clientes desta." },
  { kind: "item", num: "13.1.1", text: "o tratamento de dados seja limitado às atividades necessárias ao alcance das finalidades de execução do contrato e do serviço contratado, utilizando-os, quando seja o caso, em cumprimento de obrigação legal ou regulatória, no exercício regular de direito, por determinação judicial." },
  { kind: "item", num: "13.1.2", text: "os sistemas que servirão de base para armazenamento dos dados pessoais coletados, seguem um conjunto de premissas, políticas e especificações técnicas seguros, afim de preservar a privacidade dos dados, conforme dispõe a LGPD." },
  { kind: "item", num: "13.2", text: "Os dados pessoais não poderão ser revelados a terceiros, com exceção da prévia autorização por escrito da **CONTRATANTE**, quer direta ou indiretamente, seja mediante a distribuição de cópias, resumos, compilações, extratos, análises, estudos ou outros meios que contenham ou de outra forma reflitam referidas Informações." },
  { kind: "item", num: "13.2.1", text: "Caso a **CONTRATADA** seja obrigada por determinação legal a fornecer dados pessoais a uma autoridade pública, deverá informar previamente a **CONTRATANTE** para que esta tome as medidas que julgar cabíveis." },
  { kind: "item", num: "13.2.2", text: "A **CONTRATADA** deverá notificar a **CONTRATANTE** em até 24 (vinte e quatro) horas a respeito de:" },
  { kind: "item", text: "i) Qualquer não cumprimento (ainda que suspeito) das disposições legais relativas à proteção de Dados Pessoais pela **CONTRATADA**, seus funcionários, ou terceiros autorizados;", indent: true },
  { kind: "item", text: "ii) Qualquer outra violação de segurança no âmbito das atividades e responsabilidades da **CONTRATADA**.", indent: true },
  { kind: "item", num: "13.3", text: "Fica convencionado que cada uma das partes concorda e garante que é individualmente responsável pelo cumprimento de suas obrigações decorrentes da **LGPD** e de eventuais regulamentações emitidas posteriormente pela **ANPD**." },
  { kind: "item", num: "13.4", text: "Encerrada a vigência do contrato ou não havendo mais necessidade de utilização dos dados pessoais, sejam eles sensíveis ou não, a Contratada interromperá o tratamento dos Dados Pessoais disponibilizados pela Contratante e, em no máximo (30) dias, eliminará completamente os Dados Pessoais e todas as cópias porventura existentes (seja em formato digital ou físico), salvo quando a **CONTRATADA** tiver que manter os dados para cumprimento de obrigação legal ou outra hipótese da **LGPD**." },
  { kind: "item", text: "**__Parágrafo Único: O uso indevido do contrato de prestação de serviço da contratada ou quaisquer documentos da mesma pela contratante após o cancelamento do contrato constitui crime de Falsificação de documento particular, previsto no art. 298 do Código Penal Brasileiro, bem como locupletamento ilícito previsto no art. 884 e seguinte do Código Civil Brasileiro.__**" },
];
