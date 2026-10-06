/* ── Spendscape · categories ─────────────────────────────────────────────
   The category list, merchant-name cleanup and the rules that put a
   transaction in a category.

   A transaction's category is decided, first match wins, by:
     1. the user moving that one transaction,
     2. a rule the user made for its merchant ("always file Blue Bottle
        under Dining"),
     3. a known merchant or an unmistakable phrase ("PAYMENT THANK YOU"),
     4. the category column of the bank's own export, when it has one,
     5. generic words ("restaurant", "pharmacy"),
     6. otherwise money in is Income and money out is Uncategorized.
   Steps 3-6 run once at import; 1-2 are applied live by the app.        */
(function (kit) {
  "use strict";

  /* kind: "expense" counts as spending, "income" as income, and
     "transfer" is money moving between your own accounts, which is
     neither. Refunds stay in their expense category and net it down. */
  var CATEGORIES = [
    { id: "housing",       name: "Housing",           icon: "🏠", kind: "expense", short: "Housing" },
    { id: "groceries",     name: "Groceries",         icon: "🛒", kind: "expense", short: "Groceries" },
    { id: "dining",        name: "Dining & drinks",   icon: "🍜", kind: "expense", short: "Dining" },
    { id: "transport",     name: "Transport",         icon: "🚗", kind: "expense", short: "Transport" },
    { id: "shopping",      name: "Shopping",          icon: "🛍️", kind: "expense", short: "Shopping" },
    { id: "utilities",     name: "Bills & utilities", icon: "💡", kind: "expense", short: "Bills" },
    { id: "entertainment", name: "Entertainment",     icon: "🎬", kind: "expense", short: "Entertainment" },
    { id: "health",        name: "Health & fitness",  icon: "🩺", kind: "expense", short: "Health" },
    { id: "travel",        name: "Travel",            icon: "✈️", kind: "expense", short: "Travel" },
    { id: "home",          name: "Home & garden",     icon: "🪴", kind: "expense", short: "Home" },
    { id: "insurance",     name: "Insurance",         icon: "🛡️", kind: "expense", short: "Insurance" },
    { id: "education",     name: "Education & kids",  icon: "🎓", kind: "expense", short: "Education" },
    { id: "personal",      name: "Personal care",     icon: "💇", kind: "expense", short: "Personal" },
    { id: "pets",          name: "Pets",              icon: "🐾", kind: "expense", short: "Pets" },
    { id: "gifts",         name: "Gifts & giving",    icon: "🎁", kind: "expense", short: "Gifts" },
    { id: "fees",          name: "Fees & interest",   icon: "🧾", kind: "expense", short: "Fees" },
    { id: "cash",          name: "Cash & ATM",        icon: "💵", kind: "expense", short: "Cash" },
    { id: "taxes",         name: "Taxes",             icon: "🏛️", kind: "expense", short: "Taxes" },
    { id: "uncategorized", name: "Uncategorized",     icon: "❔", kind: "expense", short: "Uncategorized" },
    { id: "income",        name: "Income",            icon: "💰", kind: "income", short: "Income" },
    { id: "transfer",      name: "Transfers",         icon: "🔁", kind: "transfer", short: "Transfers" }
  ];

  var BY_ID = {};
  CATEGORIES.forEach(function (c) { BY_ID[c.id] = c; });

  var OUT = -1, IN = 1, ANY = 0;

  /* ── Strong rules ────────────────────────────────────────────────────
     [pattern, category, merchant name, direction]. Tested in order against
     the lower-cased description and memo, so the specific comes before
     the general: Uber Eats before Uber, Prime Video before Amazon.      */
  var STRONG = [
    // Loan payments name a bank too, so they go before card payments.
    [/mortgage|\bmtg\b|home loan|\bheloc\b/, "housing", null, OUT],
    [/auto loan|car loan|auto financ|chase auto|ally auto|carmax auto|(toyota|honda|nissan|ford|hyundai|kia|bmw|mercedes|volkswagen|vw|tesla|gm) (financial|finance|motor credit)/, "transport", null, OUT],

    // Fees and interest charged, and their occasional refunds.
    [/fee (refund|reversal|rebate)|(refund|reversal) of .{0,20}fee/, "fees", null, IN],
    [/interest charge|finance charge|purchase interest|interest on purchases|cash advance (fee|interest)|late (fee|charge|payment fee)|annual (fee|membership fee)|overdraft|\bnsf\b|insufficient funds|returned item|monthly (service|maintenance) (fee|charge)|service (fee|charge)|foreign (transaction|exchange|currency) fee|intl (transaction|tran) fee|atm fee|wire (fee|transfer fee)|account fee|\bfee\b/, "fees", null, OUT],

    // Income, ahead of transfers: "SALARY TRANSFER" is pay.
    [/payroll|salary|direct dep|dir dep|paycheck|\bwages\b|\bgehalt\b|\blohn\b|salaire|nomina|salaris|\bpay ?roll|\b(adp|gusto|paychex|rippling|justworks|trinet|deel)\b/, "income", null, IN],
    [/interest (paid|earned|credit|payment|income)|\binterest\b$|dividend|\bdiv\b|cash ?back|rewards? (credit|redemption)|statement credit/, "income", null, IN],
    [/tax ?ref|irs treas 310|\bssa treas|social security|pension|annuity|unemployment|\bbenefit/, "income", null, IN],

    // Money moving between your own accounts.
    [/payment.{0,12}thank ?you|thank ?you.{0,12}payment|autopay(ment)? payment|automatic payment|mobile payment.{0,10}thank/, "transfer", "Card payment", ANY],
    [/\b(chase|amex|american express|citi(card|bank)?|discover|capital one|barclaycard|barclays|bk of amer|bank of america|wells fargo|synchrony|apple ?card|gs bank|goldman sachs|us bank|usaa|navy federal|card ?services|credit ?card|crd|cc)\b.{0,32}\b(pay|pmt|pymt|payment|autopay|epay|e-payment|onlinepmt)/, "transfer", null, ANY],
    [/\b(online|mobile|internal|instant|bank|funds|book|account)? ?(transfer|xfer|trnsfr|tfr)\b|transfer (to|from)|\bto (savings|checking|chk|sav)\b|\bfrom (savings|checking|chk|sav)\b|\bumbuchung|\bvirement (interne|permanent)|\btraspaso/, "transfer", null, ANY],
    [/\b(fidelity|vanguard|schwab|robinhood|coinbase|e\*?trade|wealthfront|betterment|acorns|stash|moneybox|trading 212|etoro|ally invest|m1 finance|sofi invest)\b/, "transfer", null, ANY],

    // Taxes.
    [/\birs\b|us treasury|treas tax|tax payment|state tax|franchise tax|\bftb\b|\bhmrc\b|council tax|property tax|finanzamt|\bimpots?\b|dgfip|agencia tributaria/, "taxes", null, OUT],

    // Dining before transport and shopping, for Uber Eats and friends.
    [/uber ?\*? ?eats|ubereats/, "dining", "Uber Eats", ANY],
    [/doordash|dd \*|dd\*/, "dining", "DoorDash", ANY],
    [/grubhub|seamless/, "dining", "Grubhub", ANY],
    [/postmates/, "dining", "Postmates", ANY],
    [/deliveroo/, "dining", "Deliveroo", ANY],
    [/just ?eat/, "dining", "Just Eat", ANY],
    [/starbucks|sbux/, "dining", "Starbucks", ANY],
    [/dunkin/, "dining", "Dunkin'", ANY],
    [/peet'?s/, "dining", "Peet's Coffee", ANY],
    [/blue bottle/, "dining", "Blue Bottle Coffee", ANY],
    [/philz/, "dining", "Philz Coffee", ANY],
    [/tim horton/, "dining", "Tim Hortons", ANY],
    [/costa coffee/, "dining", "Costa Coffee", ANY],
    [/pret a manger|\bpret\b/, "dining", "Pret A Manger", ANY],
    [/mcdonald/, "dining", "McDonald's", ANY],
    [/burger king/, "dining", "Burger King", ANY],
    [/wendy'?s/, "dining", "Wendy's", ANY],
    [/taco bell/, "dining", "Taco Bell", ANY],
    [/chipotle/, "dining", "Chipotle", ANY],
    [/\bsubway\b/, "dining", "Subway", ANY],
    [/panera/, "dining", "Panera Bread", ANY],
    [/chick-?fil-?a/, "dining", "Chick-fil-A", ANY],
    [/\bkfc\b/, "dining", "KFC", ANY],
    [/popeyes/, "dining", "Popeyes", ANY],
    [/domino'?s/, "dining", "Domino's", ANY],
    [/pizza hut/, "dining", "Pizza Hut", ANY],
    [/papa john/, "dining", "Papa John's", ANY],
    [/five guys/, "dining", "Five Guys", ANY],
    [/shake shack/, "dining", "Shake Shack", ANY],
    [/in-n-out/, "dining", "In-N-Out", ANY],
    [/sweetgreen/, "dining", "Sweetgreen", ANY],
    [/panda express/, "dining", "Panda Express", ANY],
    [/nando'?s/, "dining", "Nando's", ANY],
    [/greggs/, "dining", "Greggs", ANY],
    [/wagamama/, "dining", "Wagamama", ANY],
    [/olive garden|applebee|chili'?s|ihop|denny'?s|cheesecake factory|buffalo wild|red robin|outback steak|cracker barrel|texas roadhouse|dairy queen|krispy kreme|arby'?s|sonic drive|jack in the box|wingstop|jersey mike|jimmy john|firehouse sub|qdoba|cava\b|noodles & co|el pollo loco|zaxby/, "dining", null, ANY],

    // Groceries.
    [/amazon ?fresh|amzn fresh|amazon grocery/, "groceries", "Amazon Fresh", ANY],
    [/whole ?foods|wholefds|whole fds/, "groceries", "Whole Foods", ANY],
    [/trader joe/, "groceries", "Trader Joe's", ANY],
    [/safeway/, "groceries", "Safeway", ANY],
    [/kroger/, "groceries", "Kroger", ANY],
    [/\baldi\b/, "groceries", "Aldi", ANY],
    [/\blidl\b/, "groceries", "Lidl", ANY],
    [/tesco/, "groceries", "Tesco", ANY],
    [/sainsbury/, "groceries", "Sainsbury's", ANY],
    [/waitrose/, "groceries", "Waitrose", ANY],
    [/\basda\b/, "groceries", "Asda", ANY],
    [/morrisons/, "groceries", "Morrisons", ANY],
    [/publix/, "groceries", "Publix", ANY],
    [/wegmans/, "groceries", "Wegmans", ANY],
    [/\bh-?e-?b\b/, "groceries", "H-E-B", ANY],
    [/sprouts/, "groceries", "Sprouts", ANY],
    [/costco/, "groceries", "Costco", ANY],
    [/sam'?s club/, "groceries", "Sam's Club", ANY],
    [/instacart/, "groceries", "Instacart", ANY],
    [/\brewe\b/, "groceries", "REWE", ANY],
    [/\bedeka\b/, "groceries", "EDEKA", ANY],
    [/carrefour/, "groceries", "Carrefour", ANY],
    [/albert heijn/, "groceries", "Albert Heijn", ANY],
    [/woolworths/, "groceries", "Woolworths", ANY],
    [/\bcoles\b/, "groceries", "Coles", ANY],
    [/albertsons|vons\b|ralphs|food lion|stop ?& ?shop|giant eagle|giant food|meijer|winco|hy-vee|harris teeter|piggly|shoprite|market basket|fred meyer|smith'?s food|king soopers|lucky supermarket|grocery outlet|99 ranch|h ?mart|loblaws|sobeys|no frills|metro inc|penny markt|netto|kaufland|monoprix|intermarche|leclerc|auchan|mercadona|esselunga|coop\b|migros|spar\b|iceland foods|m&s food|co-op food/, "groceries", null, ANY],

    // Transport.
    [/\buber\b|uber \*?trip|uber\.com/, "transport", "Uber", ANY],
    [/\blyft\b/, "transport", "Lyft", ANY],
    [/\bbolt\b\.eu|bolt\.eu/, "transport", "Bolt", ANY],
    [/\b(shell|chevron|exxon|exxonmobil|mobil|texaco|arco|valero|sunoco|citgo|marathon petro|speedway|circle k|phillips 66|conoco|76 ?gas|bp\b|esso|aral|total ?energies|q8)\b/, "transport", null, OUT],
    [/\b(mta|nyct|bart|caltrain|clipper|septa|wmata|mbta|cta\b|metro ?card|metrolink|tfl|oyster card|translink|opal|presto|ventra|omny|go transit|muni)\b|tfl\.gov|tfl travel/, "transport", null, ANY],
    [/parking|parkmobile|park mobile|spothero|paybyphone|ringgo|\btoll|e-?zpass|fastrak|sunpass|ipass|dmv\b|jiffy lube|autozone|o'?reilly auto|advance auto|pep boys|firestone|midas|car wash|valvoline|tesla supercharg|chargepoint|evgo|electrify america|lime\*|lime \*|\bbird\b ride|citi ?bike|zipcar|getaround/, "transport", null, ANY],

    // Travel.
    [/airbnb/, "travel", "Airbnb", ANY],
    [/\bvrbo\b|homeaway/, "travel", "Vrbo", ANY],
    [/expedia/, "travel", "Expedia", ANY],
    [/booking\.com|bkg\*/, "travel", "Booking.com", ANY],
    [/hotels\.com/, "travel", "Hotels.com", ANY],
    [/delta air|\bdelta\b \d|united air|united\.com|american air|\baa\.com|southwest|jetblue|alaska air|spirit air|frontier air|hawaiian air|british airways|lufthansa|air france|\bklm\b|ryanair|easyjet|emirates|qantas|air canada|westjet|virgin atlantic|iberia|turkish airlines|qatar air|singapore air|cathay|wizz ?air|norwegian air|aer lingus|\bairlines?\b|\bairways\b/, "travel", null, ANY],
    [/marriott|hilton|hyatt|\bihg\b|holiday inn|sheraton|westin|four seasons|radisson|best western|wyndham|la quinta|motel 6|premier inn|travelodge|accor|novotel|ibis\b|\bhotel\b|\bmotel\b|\bhostel\b|\bresort\b/, "travel", null, ANY],
    [/hertz|\bavis\b|enterprise rent|budget rent|\bsixt\b|alamo|national car|\bturo\b|amtrak|eurostar|trainline|greyhound|megabus|flixbus|deutsche bahn|\bdb bahn|\bsncf\b|\brenfe\b|trenitalia|\bvia rail|global entry|tsa pre|duty free|cruise|royal caribbean|carnival cruise|kayak|priceline|agoda|trivago|hopper/, "travel", null, ANY],

    // Entertainment and media.
    [/prime video|primevideo|amazon video/, "entertainment", "Prime Video", ANY],
    [/netflix/, "entertainment", "Netflix", ANY],
    [/spotify/, "entertainment", "Spotify", ANY],
    [/\bhulu\b/, "entertainment", "Hulu", ANY],
    [/disney ?(plus|\+)|disneyplus/, "entertainment", "Disney+", ANY],
    [/\bhbo\b|hbo ?max|\bmax\.com/, "entertainment", "Max", ANY],
    [/paramount\+|paramount plus/, "entertainment", "Paramount+", ANY],
    [/peacock/, "entertainment", "Peacock", ANY],
    [/youtube|google \*youtube/, "entertainment", "YouTube", ANY],
    [/apple\.com\/bill|apple services|itunes|apple music|apple tv/, "entertainment", "Apple", ANY],
    [/audible/, "entertainment", "Audible", ANY],
    [/kindle/, "entertainment", "Kindle", ANY],
    [/steam ?games|steampowered|\bsteam\b/, "entertainment", "Steam", ANY],
    [/playstation|\bpsn\b|sony interactive/, "entertainment", "PlayStation", ANY],
    [/xbox|microsoft \*xbox/, "entertainment", "Xbox", ANY],
    [/nintendo/, "entertainment", "Nintendo", ANY],
    [/twitch/, "entertainment", "Twitch", ANY],
    [/\bamc\b/, "entertainment", "AMC Theatres", ANY],
    [/ticketmaster|live ?nation|stubhub|eventbrite|seatgeek|axs\.com|dice\.fm|fandango|regal cinema|cinemark|odeon|cineworld|vue cinema|cinema|theatre|theater|\bmuseum|bowling|concert|sirius|pandora|tidal|crunchyroll|deezer|new york times|nytimes|\bwsj\b|washington post|the economist|substack|medium\.com/, "entertainment", null, ANY],

    // Bills, utilities and software.
    [/comcast|xfinity/, "utilities", "Xfinity", ANY],
    [/spectrum/, "utilities", "Spectrum", ANY],
    [/verizon/, "utilities", "Verizon", ANY],
    [/at&t|\batt\b|at ?& ?t/, "utilities", "AT&T", ANY],
    [/t-?mobile/, "utilities", "T-Mobile", ANY],
    [/vodafone/, "utilities", "Vodafone", ANY],
    [/pg&e|pacific gas|\bpge\b/, "utilities", "PG&E", ANY],
    [/con ?ed\b|consolidated edison/, "utilities", "Con Edison", ANY],
    [/google (storage|one|\*google one|cloud|workspace|gsuite|fi\b)/, "utilities", "Google", ANY],
    [/icloud/, "utilities", "iCloud", ANY],
    [/dropbox|microsoft ?365|msft \*|office 365|adobe|github|openai|chatgpt|anthropic|claude\.ai|notion|zoom\.us|slack|1password|lastpass|nordvpn|expressvpn|godaddy|squarespace|wix\.com|namecheap|backblaze/, "utilities", null, ANY],
    [/cox comm|sprint\b|mint mobile|google fi|visible\b|cricket wireless|boost mobile|metro by t|us cellular|virgin media|\bbt group|\bbt\b broadband|sky digital|sky uk|\bo2\b|three\.co|giffgaff|plusnet|talktalk|telekom|telefonica|orange sa|bouygues|free mobile|optus|telstra|rogers|bell canada|telus|duke energy|dominion energy|xcel energy|national grid|southern california edison|\bsce\b|sdg&e|peco\b|eversource|entergy|ameren|dte energy|consumers energy|georgia power|fpl\b|florida power|octopus energy|british gas|edf energy|e\.on|ovo energy|e-?on\b|water (dept|district|utility|bill)|electric|utility|utilities|internet (service|bill|provider)|broadband|\bwireless\b|telecom/, "utilities", null, ANY],

    // Housing.
    [/\brent\b|\brental (payment|pmt)|\blease\b|apartment|\bapts?\b|property management|prop mgmt|landlord|\bhoa\b|homeowners assoc|condo assoc|rentcafe|apartments\.com|zillow rent|\bbilt\b|\bmiete\b|\bloyer\b|alquiler|\bhuur\b/, "housing", null, OUT],

    // Home and garden.
    [/home ?depot/, "home", "The Home Depot", ANY],
    [/lowe'?s/, "home", "Lowe's", ANY],
    [/\bikea\b/, "home", "IKEA", ANY],
    [/wayfair/, "home", "Wayfair", ANY],
    [/bed bath|crate ?(&|and) ?barrel|pottery barn|west elm|williams.sonoma|menards|ace hardware|true value|harbor freight|\bb&q\b|homebase|wickes|leroy merlin|\bobi\b|bauhaus|hornbach|furniture|mattress|hardware|garden cent|nursery|plumb|electrician|handyman|cleaning service|\bmaid\b|taskrabbit|\bangi\b|thumbtack|pest control|lawn/, "home", null, ANY],

    // Insurance.
    [/geico|state farm|progressive|allstate|farmers ins|liberty mutual|nationwide|usaa (p&c|ins)|metlife|prudential|aflac|lemonade|root ins|esurance|aviva|\baxa\b|allianz|direct line|admiral|aetna|cigna|humana|blue cross|\bbcbs\b|unitedhealth|insurance|\binsur|versicherung|assurance|seguro/, "insurance", null, OUT],

    // Health and fitness.
    [/\bcvs\b/, "health", "CVS", ANY],
    [/walgreens/, "health", "Walgreens", ANY],
    [/rite aid/, "health", "Rite Aid", ANY],
    [/\bboots\b/, "health", "Boots", ANY],
    [/planet fitness|la fitness|24 hour fitness|equinox|crunch fitness|orangetheory|soulcycle|peloton|classpass|anytime fitness|gold'?s gym|puregym|the gym group|david lloyd|f45|barry'?s|\bymca\b|\bgym\b|fitness|yoga|pilates|crossfit|strava|myfitnesspal/, "health", null, ANY],
    [/pharmacy|apotheke|pharmacie|farmacia|doctor|medical|clinic|hospital|\bhealth\b|dental|dentist|orthodont|optometr|optician|vision center|eye care|labcorp|quest diag|urgent care|kaiser|one medical|therapy|therapist|counsel|chiropract|physio|\bhims\b|nurx|zocdoc|goodrx|\bnhs\b/, "health", null, ANY],

    // Personal care.
    [/sephora/, "personal", "Sephora", ANY],
    [/\bulta\b/, "personal", "Ulta Beauty", ANY],
    [/salon|barber|haircut|great clips|supercuts|sport clips|\bspa\b|massage|\bnails?\b|beauty|cosmetic|european wax|waxing|laundr|dry ?clean|tailor/, "personal", null, ANY],

    // Pets.
    [/chewy/, "pets", "Chewy", ANY],
    [/petco|petsmart|pets at home|\bvet\b|veterinar|animal hospital|banfield|barkbox|\brover\.com|\bpet\b/, "pets", null, ANY],

    // Education, childcare and kids.
    [/tuition|universit|college|school|academy|coursera|udemy|\bedx\b|skillshare|masterclass|duolingo|chegg|pearson|student loan|navient|nelnet|great lakes|sallie mae|fedloan|mohela|aidvantage|daycare|day care|childcare|child care|preschool|nanny|babysit|kindergarten|kita\b/, "education", null, ANY],

    // Gifts and giving.
    [/\bdonat(e|ion|ions)\b|charity|charitable|foundation|red cross|unicef|gofundme|patreon|church|tithe|mosque|synagogue|nonprofit|salvation army|wikimedia|oxfam|doctors without|\bmsf\b|\baclu\b|\bnpr\b|\bpbs\b|1-?800-?flowers|florist|\bflowers\b|hallmark|gift/, "gifts", null, ANY],

    // Shopping, last of the merchants because it is the broadest.
    [/amazon prime|prime membership|amzn prime/, "shopping", "Amazon Prime", ANY],
    [/amazon|amzn/, "shopping", "Amazon", ANY],
    [/\btarget\b/, "shopping", "Target", ANY],
    [/wal-?mart|wm supercenter/, "shopping", "Walmart", ANY],
    [/\bebay\b/, "shopping", "eBay", ANY],
    [/\betsy\b/, "shopping", "Etsy", ANY],
    [/best ?buy/, "shopping", "Best Buy", ANY],
    [/apple store|apple\.com(?!\/bill)/, "shopping", "Apple Store", ANY],
    [/macy'?s|nordstrom|kohl'?s|tj ?maxx|marshalls|ross stores|old navy|\bgap\b|h&m|\bzara\b|uniqlo|\bnike\b|adidas|lululemon|dollar tree|dollar general|five below|michaels|joann|hobby lobby|staples|office depot|gamestop|shein|temu|aliexpress|zalando|\basos\b|argos|john lewis|primark|currys|\bboots\b|nordstrom rack|burlington|j\.? ?crew|banana republic|anthropologie|urban outfitters|foot locker|dick'?s sporting|rei\b|decathlon|barnes ?& ?noble|waterstones|goodwill|thrift/, "shopping", null, ANY],

    // Cash.
    [/\batm\b|cash withdrawal|withdrawal at|bargeld|retrait|cajero|geldautomat/, "cash", null, OUT],

    // Person-to-person apps: usually paying friends back or moving money.
    [/zelle|venmo|cash ?app|square cash|paypal|\bwise\b|transferwise|revolut|\bmonzo\b|apple cash|google pay send|interac e-?transfer|e-?transfer/, "transfer", null, ANY]
  ];

  /* ── Weak rules: generic words, used only after the bank's own category.
     Same shape as STRONG. */
  var WEAK = [
    [/restaurant|\bcafe\b|caf[eé]|coffee|espresso|\bbar\b|\bpub\b|brewery|brewing|tavern|grill|bistro|\bdiner\b|sushi|ramen|taqueria|bakery|donut|bagel|\bdeli\b|eatery|steakhouse|pizzeria|pizza|burger|kitchen|noodle|dumpling|bbq|wine bar|tst\*|toast/, "dining", null, ANY],
    [/grocer|supermarket|supermercado|supermarche|\bmarket\b|\bmkt\b|epicerie|lebensmittel|food store|foods\b/, "groceries", null, ANY],
    [/\bgas\b|\bfuel\b|petrol|tankstelle|gasolin/, "transport", null, OUT],
    [/\bstore\b|\bshop\b|boutique|outlet|retail|\bmall\b/, "shopping", null, ANY],
    [/refund|return|reversal/, "shopping", null, IN],
    [/\bcheck\b|\bcheque\b|\bchk\b/, "uncategorized", null, OUT],
    [/withdrawal|\bcash\b/, "cash", null, OUT],
    [/deposit|\bcredit\b|\bgutschrift|virement re[cç]u|\bincoming\b/, "income", null, IN]
  ];

  /* ── The bank's own categories ───────────────────────────────────────
     Chase, Capital One, Mint, Monzo, Revolut and friends all export a
     category column. Map their names onto ours; order matters ("Auto
     Insurance" is insurance, "ATM Fee" is a fee, "Gas & Electric" is a
     utility).                                                         */
  var BANK_CATEGORIES = [
    [/insur/, "insurance"],
    [/credit ?card payment|payment\/credit|\btransfer|savings|investment|\bfinances\b|\bpot\b/, "transfer"],
    [/income|paycheck|salary|payroll|wage|bonus|dividend|interest income|reimburse|deposit/, "income"],
    [/\bfee|finance charge|late|service charge|adjustment|interest/, "fees"],
    [/\btax/, "taxes"],
    [/\batm\b|^cash/, "cash"],
    [/utilit|electric|\bbills?\b|phone|mobile|internet|cable|water|television|subscription/, "utilities"],
    [/grocer|supermarket/, "groceries"],
    [/restaurant|dining|food ?(&|and) ?drink|eating ?out|eating_out|fast food|coffee|cafe|\bbars?\b|alcohol|takeaway|^food$/, "dining"],
    [/mortgage|\brent\b|housing/, "housing"],
    [/\bhome\b|garden|furnish|lawn|household|improvement/, "home"],
    [/travel|\bair|hotel|lodging|vacation|holiday|rental car/, "travel"],
    [/\bgas\b|fuel|auto|transport|transit|taxi|parking|\bcar\b|ride|commut/, "transport"],
    [/health|medical|pharmacy|doctor|dentist|dental|fitness|gym|wellness|vision|eye/, "health"],
    [/personal ?care|personal_care|beauty|hair|\bspa\b|laundry|^personal$/, "personal"],
    [/educat|tuition|school|\bbooks? ?(&|and)? ?supplies|student|daycare|babysit|childcare|\bkids?\b|family/, "education"],
    [/\bpets?\b|veterinar/, "pets"],
    [/gift|donat|charit/, "gifts"],
    [/entertain|movie|music|stream|game|hobb|recreation|amusement|\barts?\b|sport/, "entertainment"],
    [/shop|merchandise|retail|cloth|electronic|general merch|software|sporting goods|\bbooks?\b/, "shopping"]
  ];

  function bankCategory(name) {
    var s = String(name || "").toLowerCase().replace(/_/g, " ");
    if (!s) return null;
    // A Quicken-style "Parent:Child" category: the child is more specific.
    var parts = s.split(":").reverse();
    for (var p = 0; p < parts.length; p++) {
      for (var i = 0; i < BANK_CATEGORIES.length; i++) {
        if (BANK_CATEGORIES[i][0].test(parts[p])) return BANK_CATEGORIES[i][1];
      }
    }
    return null;
  }

  function matchRules(rules, text, amount) {
    var dir = amount < 0 ? OUT : IN;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r[3] && r[3] !== dir) continue;
      if (r[0].test(text)) return r;
    }
    return null;
  }

  /* ── Merchant names ──────────────────────────────────────────────────
     "POS PURCHASE SQ *BLUE BOTTLE COFFEE 0432  OAKLAND CA" -> "Blue Bottle
     Coffee". The key (lower case) is what merchant rules are stored under,
     so every visit to the same shop shares one rule.                   */
  var PREFIXES = new RegExp("^(?:" + [
    "pos", "point of sale", "debit card", "check ?card", "visa debit", "visa", "mastercard", "debit",
    "card(?= (?:purchase|payment|pmt|transaction|tran|\\d|x{2,}))",
    "purchase", "recurring", "preauthorized", "pre-authorized", "ach", "electronic", "online", "mobile",
    "contactless", "apple pay", "google pay", "samsung pay", "tap", "dbt", "crd", "pymt", "pmt",
    "payment", "withdrawal", "debit purchase", "bill ?pay(ment)?", "web", "int'?l", "intl", "foreign",
    "kartenzahlung", "lastschrift", "cb", "carte", "prlv", "compra", "pago"
  ].join("|") + ")\\b[\\s:\\-]*", "i");
  var PROCESSORS = /^(?:sq|squ|tst|py|pp|paypal|in|sp|dd|wpy|bt|eb|fs|ls|par|cko|ztl|clv|dri|fh|smk|ggl|google|apl|paddle\.net|2co|stk|ts|olo|sumup|iz|zettle|izettle|ksq|pg|lz|bb|act|chk|sq )\s?\*\s?/i;
  var STATES = /\s(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|ON|BC|AB|QC|USA|US|GBR|GB|UK|CAN|DEU|DE|FRA|NLD|IRL|AUS)$/;

  function cleanName(desc) {
    var s = String(desc || "").replace(/[\u2018\u2019]/g, "'").trim();
    // Fixed-width exports pad the merchant and its town apart: cut there.
    s = s.split(/\s{3,}/)[0];
    for (;;) {
      var next = s.replace(PREFIXES, "")
        .replace(/^authorized on \d{1,2}\/\d{1,2}\s*/i, "")
        .replace(/^\d{1,2}\/\d{1,2}\s+/, "")
        .replace(/^\d{4}\s+(?=[a-z])/i, "")
        .replace(PROCESSORS, "")
        .trim();
      // "CARD FACTORY" is a shop, not a card prefix: never strip a
      // description down to nothing.
      if (next === s || next.replace(/[^a-z]/gi, "").length < 3) break;
      s = next;
    }
    s = s.replace(/(\S)#/g, "$1 #");

    // ACH detail fields: "ACME CORP DES:PAYROLL ID:123 INDN:..." and
    // "ACME PAYROLL PPD ID: 123".
    s = s.replace(/\s(des|id|indn|co id|ref|trn|trace|conf|confirmation|web id|ppd id|ccd id)\s?[:#].*$/i, "")
      .replace(/\s(ppd|ccd|web|tel|arc|boc|pop|ctx|iat)(\s+id)?:?\s*$/i, "");

    var words = s.split(/\s+/), keep = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (i === 0) w = w.replace(/\.(com|net|org|io|co\.uk)$/i, "");
      if (i > 0) {
        if (w === "-" || w === "|") break;
        // Stop at the first store number, card number, reference or date.
        if (/^#/.test(w) || /^\*/.test(w)) break;
        if (/\d{3,}/.test(w) && !/^\d{1,2}(st|nd|rd|th)$/i.test(w)) break;
        if (/^x{2,}\d*$/i.test(w)) break;
        if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(w)) break;
        if (/[a-z]/i.test(w) && /\d/.test(w) && w.length >= 6) break;
        if (/^(www\.|https?:)/i.test(w) || /\.(com|net|org|co\.uk)(\/\S*)?$/i.test(w)) break;
        // A street address: "45 OAK DR".
        if (/^\d+$/.test(w) && /^(st|ave?|rd|dr|blvd|ln|way|hwy|pkwy|ct|pl|street|avenue|road|drive|lane)\.?$/i.test(words[i + 2] || words[i + 1] || "")) break;
      }
      var star = w.indexOf("*");
      if (star > 0) { keep.push(w.slice(0, star)); break; }
      keep.push(w);
    }
    s = keep.join(" ");
    var before;
    do {
      before = s;
      s = s.replace(STATES, "").replace(/[\s,.\-:#*\/]+$/, "").replace(/\s(inc|llc|ltd|gmbh|plc|bv|sa|sas|srl|corp)\.?$/i, "");
    } while (s !== before && s.split(" ").length > 1);
    return s.trim() || String(desc || "").trim();
  }

  var ACRONYMS = /^(atm|irs|ach|usa|us|uk|eu|sf|nyc|la|dc|ups|usps|dmv|hoa|tv|ibm|hp|ea|abc|nbc|cnn|kfc|ihop|ymca|ikea|amc|bmw|vw|nhs|tfl|bbc|aaa|aarp|ira|hsa|fsa|llc|ny|ca|tx|fl|wa)$/;

  function titleCase(s) {
    return s.toLowerCase().replace(/[a-z0-9&'.]+/g, function (w) {
      if (ACRONYMS.test(w)) return w.toUpperCase();
      if (w.length <= 4 && !/[aeiouy]/.test(w) && /[a-z]/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }

  /* Look a transaction up once at import time. */
  function classify(t) {
    var text = (t.desc + " " + (t.memo || "")).toLowerCase();
    var strong = matchRules(STRONG, text, t.amount);
    var name = strong && strong[2] ? strong[2] : titleCase(cleanName(t.desc));
    var out = { merchant: name, key: name.toLowerCase(), cat: "", source: "" };
    if (strong) { out.cat = strong[1]; out.source = "merchant"; return out; }

    var bank = bankCategory(t.bankCat);
    // A bank calling a payment a "Transfer" or an outflow "Income" is a
    // mismatch with the sign; trust the sign.
    if (bank && !(bank === "income" && t.amount < 0)) {
      out.cat = bank; out.source = "bank"; return out;
    }
    var weak = matchRules(WEAK, text, t.amount);
    if (weak) { out.cat = weak[1]; out.source = "keyword"; return out; }
    out.cat = t.amount > 0 ? "income" : "uncategorized";
    out.source = "fallback";
    return out;
  }

  kit.categories = {
    list: CATEGORIES,
    byId: BY_ID,
    classify: classify,
    cleanName: cleanName,
    titleCase: titleCase,
    bankCategory: bankCategory,
    kindOf: function (id) { return (BY_ID[id] || BY_ID.uncategorized).kind; }
  };
})(window.SpendscapeKit = window.SpendscapeKit || {});
