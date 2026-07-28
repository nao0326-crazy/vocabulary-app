const words = [
  {
    "english": "signify",
    "japanese": "〜を意味する、示す"
  },
  {
    "english": "wealth",
    "japanese": "富、財産"
  },
  {
    "english": "necessarily",
    "japanese": "必ずしも（〜ない）"
  },
  {
    "english": "significant",
    "japanese": "重要な、かなりの"
  },
  {
    "english": "amount",
    "japanese": "量、総計"
  },
  {
    "english": "significantly",
    "japanese": "かなり、著しく"
  },
  {
    "english": "consequence",
    "japanese": "結果、重要性"
  },
  {
    "english": "consequently",
    "japanese": "その結果、したがって"
  },
  {
    "english": "awful",
    "japanese": "ひどい、恐ろしい"
  },
  {
    "english": "belong",
    "japanese": "属する"
  },
  {
    "english": "building",
    "japanese": "建物、建設"
  },
  {
    "english": "construction",
    "japanese": "建設、建造"
  },
  {
    "english": "resemble",
    "japanese": "似ている"
  },
  {
    "english": "appearance",
    "japanese": "外見、出現"
  },
  {
    "english": "absent",
    "japanese": "欠席して、不在の"
  },
  {
    "english": "exam",
    "japanese": "試験"
  },
  {
    "english": "matter",
    "japanese": "問題、事柄、重要である"
  },
  {
    "english": "resource",
    "japanese": "資源、財源"
  },
  {
    "english": "vital",
    "japanese": "極めて重要な、生命の"
  },
  {
    "english": "issues",
    "japanese": "問題、発行（物）"
  },
  {
    "english": "organ",
    "japanese": "臓器、器官"
  },
  {
    "english": "role",
    "japanese": "役割"
  },
  {
    "english": "vitality",
    "japanese": "活力、生命力"
  },
  {
    "english": "vivid",
    "japanese": "鮮やかな、生き生きとした"
  },
  {
    "english": "revive",
    "japanese": "生き返らせる、復活させる"
  },
  {
    "english": "extinct",
    "japanese": "絶滅した"
  },
  {
    "english": "species",
    "japanese": "種（しゅ）"
  },
  {
    "english": "revival",
    "japanese": "復活、再生"
  },
  {
    "english": "essentially",
    "japanese": "本質的に"
  },
  {
    "english": "pursuit",
    "japanese": "追求、追跡"
  },
  {
    "english": "truth",
    "japanese": "真実"
  },
  {
    "english": "indispensable",
    "japanese": "不可欠な"
  },
  {
    "english": "secretary",
    "japanese": "秘書"
  },
  {
    "english": "dispense with",
    "japanese": "〜なしで済ます"
  },
  {
    "english": "formality",
    "japanese": "形式的な手続き、形式"
  },
  {
    "english": "right down to business",
    "japanese": "（本題などに）すぐ入る"
  },
  {
    "english": "held",
    "japanese": "開催された、持たれた"
  },
  {
    "english": "breath",
    "japanese": "息、呼吸"
  },
  {
    "english": "hold one's breath",
    "japanese": "息を止める、かたずをのむ"
  },
  {
    "english": "negotiation",
    "japanese": "交渉"
  },
  {
    "english": "significance",
    "japanese": "重要性、意味"
  },
  {
    "english": "broaden",
    "japanese": "〜を広げる"
  },
  {
    "english": "mind",
    "japanese": "心、精神"
  },
  {
    "english": "broaden",
    "japanese": "（幅を）広げる、深める、広がる"
  },
  {
    "english": "count",
    "japanese": "数える、重要である、価値がある、見なす、頼りにする、計算、総数、伯爵"
  },
  {
    "english": "process",
    "japanese": "過程、工程、手順、進行、加工する、処理する、審査する"
  },
  {
    "english": "make a difference",
    "japanese": "違いを生む、影響を与える、重要である"
  },
  {
    "english": "politics",
    "japanese": "政治、政治学、政見、駆け引き"
  },
  {
    "english": "trivial",
    "japanese": "些細な、取るに足らない、平凡な"
  },
  {
    "english": "detail",
    "japanese": "詳細、細部、項目、詳しく述べる、詳述する、選抜する"
  },
  {
    "english": "arguing",
    "japanese": "議論している、主張している、言い争っている"
  },
  {
    "english": "triviality",
    "japanese": "些細なこと、平凡、くだらなさ"
  },
  {
    "english": "relationship",
    "japanese": "関係、親族関係、結びつき"
  },
  {
    "english": "trifle",
    "japanese": "些細なこと、少量、つまらないもの、もてあそぶ、いい加減に扱う"
  },
  {
    "english": "get rid of",
    "japanese": "取り除く、処分する、免れる"
  },
  {
    "english": "rid",
    "japanese": "取り除く、除去する、免れさせる"
  },
  {
    "english": "fill",
    "japanese": "満たす、いっぱいにする、占める、補充する、十分な量、満足"
  },
  {
    "english": "common",
    "japanese": "共通の、一般的な、ありふれた、公共の、公有地、共有地"
  },
  {
    "english": "sense",
    "japanese": "感覚、意味、良識、正気、感じ取る、気づく、感知する"
  },
  {
    "english": "totally",
    "japanese": "完全に、全く、すっかり"
  },
  {
    "english": "actually",
    "japanese": "実際には、実は、本当に"
  },
  {
    "english": "excuse",
    "japanese": "許す、免除する、言い訳をする、言い訳、口実、弁解"
  },
  {
    "english": "commonplace",
    "japanese": "平凡な、ありふれた、陳腐な、ありふれたこと、陳腐な言葉"
  },
  {
    "english": "expression",
    "japanese": "表現、表情、言い回し、数式"
  },
  {
    "english": "ordinary",
    "japanese": "普通の、平凡な、並の"
  },
  {
    "english": "extraordinary",
    "japanese": "並外れた、異常な、驚くべき、臨時の"
  },
  {
    "english": "talent",
    "japanese": "才能、素質、人材、タレント"
  },
  {
    "english": "extraordinarily",
    "japanese": "非常に、並外れて、驚くほど"
  },
  {
    "english": "familiar",
    "japanese": "よく知られた、親しい、精通している"
  },
  {
    "english": "familiarity",
    "japanese": "熟知、親しさ、馴れ馴れしさ"
  },
  {
    "english": "emphasize",
    "japanese": "強調する、重視する、目立たせる"
  },
  {
    "english": "importance",
    "japanese": "重要性、大切さ、重大さ"
  },
  {
    "english": "emphasis",
    "japanese": "強調、重点、強勢（アクセント）"
  },
  {
    "english": "quality",
    "japanese": "質、品質、特性、良質、良質な、高級な"
  },
  {
    "english": "products",
    "japanese": "製品、産物、成果、積（数学）"
  },
  {
    "english": "emphatic",
    "japanese": "強調された、断固とした、力強い"
  },
  {
    "english": "stress",
    "japanese": "ストレス、圧迫、強調、重点、強勢、強調する、重点を置く、圧力をかける"
  },
  {
    "english": "relieve",
    "japanese": "（苦痛などを）和らげる、安心させる、交代する、救済する"
  },
  {
    "english": "feel",
    "japanese": "感じる、思う、触れる、探る、感触、手触り、感覚"
  },
  {
    "english": "put stress on A",
    "japanese": "Aを強調する、Aに重点を置く、Aに圧力をかける"
  },
  {
    "english": "politician",
    "japanese": "政治家、策士"
  },
  {
    "english": "neglect",
    "japanese": "怠る、無視する、放置する、世話をしない、怠慢、放置、無視"
  },
  {
    "english": "be indulged in",
    "japanese": "～にふける、～に溺れる、～を楽しんでいる"
  },
  {
    "english": "hobby",
    "japanese": "趣味、道楽"
  },
  {
    "english": "indulged",
    "japanese": "甘やかされた、ふけった"
  },
  {
    "english": "negligence",
    "japanese": "怠慢、過失、不注意"
  },
  {
    "english": "negligible",
    "japanese": "無視できるほどの、些細な"
  },
  {
    "english": "ignore",
    "japanese": "無視する、知らないふりをする、却下する"
  },
  {
    "english": "ignorant",
    "japanese": "無知な、知らない、教育を受けていない"
  },
  {
    "english": "income",
    "japanese": "収入、所得、入ってくるもの"
  },
  {
    "english": "recent",
    "japanese": "最近の、近頃の"
  },
  {
    "english": "subject",
    "japanese": "主題、科目、被験者、主語、国民、支配下にある、受けやすい、～次第である、服従させる、さらす、受けさせる"
  },
  {
    "english": "ignorance",
    "japanese": "無知、知らないこと"
  },
  {
    "english": "bliss",
    "japanese": "至福、無上の喜び"
  },
  {
    "english": "eminent",
    "japanese": "著名な、優れた、卓越した"
  },
  {
    "english": "prominent",
    "japanese": "突き出した、目立つ、著名な、重要な"
  },
  {
    "english": "feature",
    "japanese": "特徴、顔立ち、特集記事、呼び物、特集する、呼び物にする、主演させる"
  },
  {
    "english": "hooked",
    "japanese": "鉤状の、夢中になって、依存して"
  },
  {
    "english": "prominence",
    "japanese": "目立つこと、卓越、隆起、プロミネンス"
  },
  {
    "english": "primary",
    "japanese": "主要な、初等の、根本的な、第一位の"
  },
  {
    "english": "concern",
    "japanese": "心配、懸念、関心事、関係、会社、心配させる、関係する、関心を持つ"
  },
  {
    "english": "primarily",
    "japanese": "主に、第一に、本来"
  },
  {
    "english": "prime",
    "japanese": "最も重要な、主要な、最高の、根本的な、全盛期、初期、準備する、注入する"
  },
  {
    "english": "minister",
    "japanese": "大臣、公使、牧師、仕える、尽くす、介抱する"
  },
  {
    "english": "prime number",
    "japanese": "素数"
  },
  {
    "english": "tiny",
    "japanese": "とても小さい、ごくわずかな"
  },
  {
    "english": "scatter",
    "japanese": "まき散らす、ばらまく、散らばる、追い散らす"
  },
  {
    "english": "scene",
    "japanese": "場面、景色、現場、騒ぎ、活動範囲"
  },
  {
    "english": "slight",
    "japanese": "わずかな、少しの、細身の、軽視する、軽蔑する、ないがしろにする"
  },
  {
    "english": "misunderstanding",
    "japanese": "誤解、不和"
  },
  {
    "english": "slightly",
    "japanese": "わずかに、少し"
  }
]
