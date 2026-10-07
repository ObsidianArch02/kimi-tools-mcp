// The MCP tool surface: two data-source entry points (same shape as the
// official kimi-datasource plugin) plus web search and URL fetch.

const DATA_SOURCE_SUMMARY = [
  "stock_finance_data = A/HK/US share quotes & financials",
  "yahoo_finance = global equities (ratings, options, holders)",
  "world_bank_open_data = World Bank historical macro",
  "tianyancha = Chinese corporate registry, risk & patents",
  "arxiv = arXiv preprints",
  "scholar = Google Scholar search",
  "yuandian_law = Chinese laws, regulations & cases",
  "wind = Wind financial terminal data (CN markets, funds, bonds, macro)",
  "imf = IMF macro (FX, CPI, forecasts)",
  "gildata = Gildata/Hundsun smart screening",
  "sec_edgar = US SEC filings (10-K, 10-Q, Form 4, 13F)",
  "sp_data = S&P Capital IQ US fundamentals",
  "china_nda = China National Data Administration open-data catalog",
  "china_nbs = National Bureau of Statistics of China indicators",
  "china_standards = CN standards (GB national, HB industry, DB local, TT association)",
  "who / fao / unsd / ecb / eurostat / unicef / oecd / fred = international organization open data",
  "xhcj = Xinhua Finance (CNFIC) news flashes, announcements, and policies",
  "caixin = Caixin database (600+ data APIs, discover via caixin_api_search first)",
].join("; ");

export const TOOLS = [
  {
    name: "get_data_source_desc",
    description:
      "Get the current API documentation for one Kimi data source before calling a specific API. " +
      "For a simple lookup, choose exactly one specialized source; do not inspect fallback or " +
      "comparison sources unless the user explicitly asks for a cross-source comparison. " +
      DATA_SOURCE_SUMMARY,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The data source name (see the list in this tool's description).",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "call_data_source_tool",
    description:
      "Dispatch one call to the data source selected for the user's request. Always call " +
      "get_data_source_desc(name) first, then use an api_name and params from that description. " +
      "For a simple lookup, use one specialized source and stop once a result covers the user's " +
      "question; do not query fallback or comparison sources unless the user explicitly asks for " +
      "a cross-source comparison. When the user names a data source, use that source.",
    inputSchema: {
      type: "object",
      properties: {
        data_source_name: {
          type: "string",
          description: "The data source selected via get_data_source_desc.",
        },
        api_name: {
          type: "string",
          description: "API name from the data source description.",
        },
        params: {
          type: "object",
          description: "API parameters that match the data source description.",
        },
      },
      required: ["data_source_name", "api_name", "params"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for information. Use this when you need up-to-date information from the " +
      "internet. Each result includes its title, its URL, and a snippet, plus its source site and " +
      "publication date when available. Results are short summaries, not full pages — when a " +
      "result looks relevant, call fetch_url on its URL to read the full page content. Prefer " +
      "specific queries, and refine the query if the results don't contain what you need. When " +
      "you rely on a result in your answer, cite its source URL.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The query text to search for." },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch a web page and return its main text content (markdown). Use this to read the full " +
      "content of a page found via web_search, or any URL the user asks about.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch content from." },
      },
      required: ["url"],
    },
  },
];
