registerChapter({
  id: 'ch01',
  title: 'Python de zéro',
  subtitle: "Le langage depuis la première ligne : variables, types, blocs indentés, fonctions, classes, imports. Chaque notion est comparée à Java et C#.",
  duration: '60 min',
  objectives: [
    "Lire et écrire du Python de base sans se perdre dans la syntaxe : indentation, <code>:</code>, absence d'accolades et de <code>;</code>.",
    'Connaître les types et collections de base (<code>str</code>, <code>int</code>, <code>list</code>, <code>dict</code>…) et savoir les parcourir.',
    'Définir des fonctions (<code>def</code>) et des classes (<code>class</code>, <code>__init__</code>, <code>self</code>) et lire leurs annotations de type.',
    'Comprendre <code>import</code>, les exceptions et le rôle d\'un décorateur <code>@…</code>.',
  ],
  content: `
<h2>Exécuter du Python</h2>
<p>Python est un langage <strong>interprété</strong> : pas d'étape de compilation, on exécute directement le fichier source <code>.py</code>.
Il n'y a pas non plus de méthode <code>main</code> obligatoire : <strong>le fichier est exécuté de haut en bas</strong>, comme un script.</p>
${py.file('hello.py')`
# Ceci est un commentaire : tout ce qui suit un # est ignoré.
print("Bonjour la bibliothèque !")
print("2 + 3 =", 2 + 3)
`}
${explain([
  [`# Ceci est un commentaire`, `Un <strong>commentaire</strong> commence par <code>#</code> et va jusqu'à la fin de la ligne. C'est l'équivalent de <code>//</code>. Il n'existe pas de <code>/* … */</code>.`],
  [`print("Bonjour la bibliothèque !")`, `<code>print</code> est une <strong>fonction native</strong> (disponible sans import) qui affiche du texte. C'est l'équivalent de <code>System.out.println</code> ou de <code>Console.WriteLine</code>. Il n'y a pas de <code>;</code> en fin de ligne : <strong>une ligne = une instruction</strong>.`],
  [`print("2 + 3 =", 2 + 3)`, `<code>print</code> accepte plusieurs arguments et les affiche séparés par un espace : <code>2 + 3 = 5</code>.`],
])}
${sh`
uv run python hello.py        # exécute le fichier
uv run python                 # ouvre la console interactive (REPL) : on tape du code, il répond
`}
${callout('tip', 'La console interactive (REPL)', `
<p>Tape <code>uv run python</code> puis essaie directement <code>2 ** 10</code>, <code>"abc".upper()</code> ou <code>len([1, 2, 3])</code>. Quitte avec <code>exit()</code>.
Garde une console ouverte pendant cette étape et teste chaque exemple : c'est le moyen le plus rapide d'apprendre.</p>`)}

<h2>Variables et types de base</h2>
<p>Une variable naît à sa <strong>première affectation</strong>. Pas de mot-clé <code>var</code>, <code>let</code> ou <code>int</code> devant :</p>
${py`
title = "Clean Code"          # str   : chaîne de caractères
copies = 3                    # int   : entier (taille illimitée)
price = 32.90                 # float : nombre à virgule
available = True              # bool  : True / False (avec une majuscule)
borrower = None               # None  : "pas de valeur" (≈ null)

copies = copies + 1           # réaffectation : copies vaut maintenant 4
copies += 1                   # forme raccourcie : 5

print(type(title))            # <class 'str'>
`}
${explain([
  [`title = "Clean Code"`, `Crée la variable <code>title</code> et lui associe la chaîne <code>"Clean Code"</code>. Les guillemets simples et doubles sont équivalents : <code>'Clean Code'</code> marche aussi.`],
  [`available = True`, `Les booléens s'écrivent <code>True</code> et <code>False</code>, <strong>avec une majuscule</strong>.`],
  [`borrower = None`, `<code>None</code> représente l'absence de valeur, comme <code>null</code>.`],
  [`copies += 1`, `Les opérateurs combinés (<code>+=</code>, <code>-=</code>…) existent, mais <strong>pas <code>++</code> ni <code>--</code></strong>.`],
  [`print(type(title))`, `<code>type(x)</code> renvoie la classe d'une valeur. Le type appartient à la <strong>valeur</strong>, pas à la variable : on pourrait écrire <code>title = 42</code> ensuite, Python ne dirait rien (mais mypy, oui).`],
])}

${define('Typage dynamique… et annotations de type', `
<p>Python est <strong>dynamiquement typé</strong> : les types sont vérifiés à l'exécution, au moment où une opération est tentée (<code>"a" + 1</code> lève une <code>TypeError</code>).
On peut cependant <strong>annoter</strong> les types avec la syntaxe <code>nom: type</code> :</p>
${py`
title: str = "Clean Code"
copies: int = 3
borrower: str | None = None     # "une str OU None"  (≈ String nullable / string?)
`}
<p>Ces annotations ne changent <strong>rien</strong> à l'exécution : Python les ignore. Elles servent à l'IDE, à <code>mypy</code> (notre « compilateur ») et à FastAPI et Pydantic, qui s'en servent pour valider les données reçues.
Dans ce tutoriel, <strong>tout le code est annoté</strong>, comme en Java ou en C#.</p>`)}

<h2>L'indentation : la règle n° 1</h2>
<p>Pas d'accolades : <strong>un bloc est défini par son indentation</strong> (4 espaces). La ligne qui ouvre un bloc se termine par <code>:</code>.</p>
${compare(['Python', 'Java / C#'], [
  [`${py`
if copies > 0:
    print("disponible")
    copies -= 1
else:
    print("épuisé")
print("fin")    # hors du if/else
`}`, `${txt`
if (copies > 0) {
    System.out.println("disponible");
    copies--;
} else {
    System.out.println("épuisé");
}
System.out.println("fin");
`}`],
])}
${explain([
  [`if copies > 0:`, `La condition n'a pas besoin de parenthèses. Le <code>:</code> final <strong>ouvre un bloc</strong>.`],
  [`    print("disponible")
    copies -= 1`, `Ces deux lignes, décalées de 4 espaces, forment le bloc exécuté si la condition est vraie. C'est l'équivalent du contenu entre <code>{ }</code>.`],
  [`else:`, `On revient à la colonne du <code>if</code> : le bloc précédent est terminé. <code>else:</code> ouvre le bloc « sinon ».`],
  [`print("fin")`, `Revenue tout à gauche, cette ligne est en dehors du <code>if/else</code> : elle s'exécute toujours.`],
])}
${callout('warn', "Erreurs d'indentation", `
<p>Mélanger tabulations et espaces, ou décaler une ligne d'un espace de trop, provoque une <code>IndentationError</code>. Configure ton éditeur pour insérer 4 espaces : c'est le réglage par défaut de VS Code et de PyCharm pour Python.
Un bloc ne peut pas être vide : on écrit <code>pass</code> (« ne rien faire ») ou <code>...</code> à la place.</p>`)}

<h2>Opérateurs</h2>
${compare(['Python', 'Java / C#', 'Remarque'], [
  ['<code>+ - * /</code>', '<code>+ - * /</code>', '<code>7 / 2</code> vaut <code>3.5</code> : la division donne toujours un float'],
  ['<code>//</code>', '<code>/</code> entre entiers', 'division entière : <code>7 // 2</code> vaut <code>3</code>'],
  ['<code>%</code>', '<code>%</code>', 'reste (modulo)'],
  ['<code>**</code>', '<code>Math.pow</code>', 'puissance : <code>2 ** 10</code> vaut <code>1024</code>'],
  ['<code>== !=  &lt; &lt;= &gt; &gt;=</code>', 'idem', '<code>==</code> compare les <strong>valeurs</strong>, même pour les chaînes'],
  ['<code>and or not</code>', '<code>&amp;&amp; || !</code>', 'en toutes lettres'],
  ['<code>is</code>, <code>is not</code>', '<code>==</code> entre références', 'identité : à utiliser pour <code>None</code> (<code>x is None</code>)'],
  ['<code>in</code>, <code>not in</code>', '<code>contains()</code>', '<code>"a" in "abc"</code>, <code>3 in [1, 2, 3]</code>'],
  ['<code>a if cond else b</code>', '<code>cond ? a : b</code>', 'ternaire, dans un ordre différent'],
  ['<code>0 &lt; x &lt; 10</code>', '<code>0 &lt; x &amp;&amp; x &lt; 10</code>', 'comparaisons chaînées'],
])}

<h2>Chaînes de caractères</h2>
${py`
author = "Robert C. Martin"
title = "Clean Code"

line = f"{title} par {author}"        # f-string : "Clean Code par Robert C. Martin"
print(len(title))                     # 10 : nombre de caractères
print(title.upper())                  # "CLEAN CODE"
print(title.startswith("Clean"))      # True
print("  isbn  ".strip())             # "isbn" : sans les espaces autour
print(title[0], title[-1])            # "C" "e" : premier et dernier caractère
print(title[0:5])                     # "Clean" : du caractère 0 inclus au 5 exclu
print("code" in title.lower())        # True

long_text = """Une chaîne
sur plusieurs lignes."""
`}
${explain([
  [`f"{title} par {author}"`, `Une <strong>f-string</strong> (préfixe <code>f</code>) remplace chaque <code>{expression}</code> par sa valeur. C'est l'équivalent de <code>$"{title} par {author}"</code> en C# ou de <code>String.format</code>. C'est la façon standard de construire du texte.`],
  [`len(title)`, `<code>len</code> est une <strong>fonction</strong>, pas une méthode : on écrit <code>len(x)</code> et non <code>x.length()</code>. Elle marche sur les chaînes, les listes, les dictionnaires…`],
  [`title.upper()`, `Les chaînes ont des méthodes : <code>upper</code>, <code>lower</code>, <code>strip</code> (≈ <code>trim</code>), <code>startswith</code>, <code>replace</code>, <code>split</code>… Une chaîne est <strong>immuable</strong> : la méthode renvoie une nouvelle chaîne.`],
  [`title[-1]`, `Les indices négatifs partent de la fin : <code>-1</code> désigne le dernier élément.`],
  [`title[0:5]`, `Le <strong>slicing</strong> <code>[début:fin]</code> extrait une portion, la fin étant exclue. Il fonctionne aussi sur les listes.`],
  [`"""Une chaîne ..."""`, `Les triples guillemets permettent d'écrire une chaîne sur plusieurs lignes, comme les text blocks Java ou les raw strings C#.`],
])}

<h2>Les collections</h2>
<p>Quatre collections sont intégrées au langage, avec une syntaxe littérale, sans <code>new</code> :</p>
${compare(['Python', 'Exemple', 'Java', 'C#'], [
  ['<code>list</code>', '<code>[1, 2, 3]</code>', '<code>ArrayList</code>', '<code>List&lt;T&gt;</code>'],
  ['<code>tuple</code>', '<code>(1, "a")</code>', '<code>record</code> anonyme', '<code>(int, string)</code>'],
  ['<code>dict</code>', '<code>{"isbn": "978…", "copies": 2}</code>', '<code>HashMap</code>', '<code>Dictionary&lt;K,V&gt;</code>'],
  ['<code>set</code>', '<code>{"a", "b"}</code>', '<code>HashSet</code>', '<code>HashSet&lt;T&gt;</code>'],
])}
${py`
# --- list : ordonnée, modifiable
titles: list[str] = ["Clean Code", "Refactoring"]
titles.append("DDD")                 # ajoute à la fin
first = titles[0]                    # "Clean Code"
titles[1] = "Refactoring (2e éd.)"   # remplace un élément
print(len(titles))                   # 3

# --- tuple : comme une liste mais NON modifiable
point: tuple[int, int] = (3, 4)
x, y = point                         # "unpacking" : x = 3, y = 4

# --- dict : clé -> valeur
stock: dict[str, int] = {"9780132350884": 2, "9780134757599": 0}
stock["9780321125217"] = 1           # ajoute (ou remplace) une entrée
print(stock["9780132350884"])        # 2   (KeyError si la clé n'existe pas)
print(stock.get("inconnu", 0))       # 0   (valeur par défaut si absente)
print("9780132350884" in stock)      # True : la clé existe-t-elle ?

# --- set : sans doublon
roles: set[str] = {"librarian", "admin", "librarian"}
print(roles)                         # {'librarian', 'admin'}
`}
${explain([
  [`titles: list[str] = [...]`, `<code>list[str]</code> se lit « liste de str ». C'est la syntaxe des génériques, avec des <code>[ ]</code> au lieu des <code>&lt; &gt;</code> de Java et C#.`],
  [`titles.append("DDD")`, `<code>append</code> est l'équivalent de <code>add</code>. Autres méthodes utiles : <code>insert</code>, <code>remove</code> et <code>pop</code>.`],
  [`x, y = point`, `L'<strong>unpacking</strong> range chaque élément du tuple dans sa variable. On le retrouvera souvent, par exemple dans <code>for key, value in stock.items():</code>.`],
  [`stock["9780321125217"] = 1`, `On accède à un dictionnaire par sa clé avec <code>[ ]</code>, en lecture comme en écriture.`],
  [`stock.get("inconnu", 0)`, `<code>get</code> renvoie la valeur par défaut au lieu de lever une erreur si la clé est absente, comme <code>getOrDefault</code> en Java.`],
  [`"9780132350884" in stock`, `<code>in</code> teste la présence d'une <strong>clé</strong> dans un dict, ou d'un élément dans une liste ou un set.`],
])}

<h2>Conditions et « valeurs vraies »</h2>
${py`
active_loans = 2

if active_loans >= 3:
    status = "bloqué"
elif active_loans > 0:               # "else if" s'écrit elif
    status = "en cours"
else:
    status = "aucun emprunt"

# Toute valeur peut servir de condition :
# sont "fausses" : False, None, 0, "", [], {}, set()  — tout le reste est "vrai".
titles: list[str] = []
if not titles:
    print("catalogue vide")

label = "disponible" if active_loans < 3 else "limite atteinte"   # ternaire
`}
${explain([
  [`elif active_loans > 0:`, `<code>elif</code> est la contraction de « else if ». On peut en enchaîner autant qu'on veut.`],
  [`if not titles:`, `Une liste vide est considérée comme « fausse ». <code>if not titles</code> est l'idiome Python pour « si la liste est vide » (≈ <code>titles.isEmpty()</code>).`],
  [`"disponible" if active_loans < 3 else "limite atteinte"`, `L'opérateur ternaire se lit naturellement : « <em>valeur1</em> si <em>condition</em>, sinon <em>valeur2</em> ».`],
])}
${callout('info', 'Pas de switch classique', `
<p>Python n'a pas de <code>switch</code> traditionnel : on enchaîne des <code>if</code> et <code>elif</code>. Depuis la version 3.10, il existe <code>match</code>/<code>case</code> (filtrage par motif), qu'on utilise peu dans ce tutoriel.</p>`)}

<h2>Boucles</h2>
${py`
titles = ["Clean Code", "Refactoring", "DDD"]

for title in titles:                 # ≈ for (String title : titles)
    print(title)

for i in range(3):                   # 0, 1, 2  ≈ for (int i = 0; i < 3; i++)
    print(i)

for index, title in enumerate(titles):   # indice + élément
    print(index, title)              # 0 Clean Code / 1 Refactoring / 2 DDD

stock = {"Clean Code": 2, "DDD": 0}
for title, copies in stock.items():  # parcourir un dict : (clé, valeur)
    print(f"{title}: {copies} ex.")

remaining = 3
while remaining > 0:
    remaining -= 1
`}
${explain([
  [`for title in titles:`, `Le <code>for</code> de Python est <strong>toujours</strong> un « foreach » : il parcourt les éléments d'une collection. <code>title</code> prend successivement chaque valeur.`],
  [`for i in range(3):`, `Pour une boucle avec compteur, on parcourt <code>range(n)</code>, qui produit les entiers de 0 à n-1.`],
  [`for index, title in enumerate(titles):`, `<code>enumerate</code> produit des couples <code>(indice, élément)</code>, que l'unpacking range dans deux variables.`],
  [`for title, copies in stock.items():`, `<code>.items()</code> parcourt un dictionnaire couple par couple <code>(clé, valeur)</code>, comme <code>entrySet()</code> en Java.`],
  [`while remaining > 0:`, `<code>while</code> fonctionne comme en Java. <code>break</code> et <code>continue</code> existent aussi.`],
])}

${define('Compréhension de liste', `
<p>Une syntaxe très utilisée pour <strong>construire une liste à partir d'une autre</strong>, en filtrant et en transformant :</p>
${py`
books = [{"title": "Clean Code", "copies": 2}, {"title": "DDD", "copies": 0}]

available = [b["title"] for b in books if b["copies"] > 0]     # ["Clean Code"]
`}
<p>Lis-la de gauche à droite : « <em>le titre de b</em>, <strong>pour chaque</strong> <em>b</em> de <em>books</em>, <strong>si</strong> <em>b a des exemplaires</em> ».
C'est l'équivalent de <code>books.stream().filter(…).map(…).toList()</code> ou de <code>books.Where(…).Select(…).ToList()</code>.</p>`)}

<h2>Fonctions</h2>
<p>Une fonction se déclare avec <code>def</code>. Elle peut vivre seule dans un fichier, sans classe autour.</p>
${py`
def loan_fee(days_late: int, daily_rate: float = 0.20) -> float:
    """Calcule la pénalité de retard (docstring : la documentation de la fonction)."""
    if days_late <= 0:
        return 0.0
    return days_late * daily_rate


loan_fee(5)                     # 1.0   : daily_rate prend sa valeur par défaut
loan_fee(5, 0.50)               # 2.5   : arguments positionnels
loan_fee(days_late=5, daily_rate=0.5)   # 2.5 : arguments nommés (plus lisible)
`}
${explain([
  [`def loan_fee(`, `<code>def</code> (pour <em>define</em>) déclare une fonction nommée <code>loan_fee</code>. Pas de modificateur <code>public</code> ou <code>static</code>.`],
  [`days_late: int`, `Un paramètre <code>days_late</code> annoté de type <code>int</code>. Attention, l'ordre est inversé par rapport à Java : <strong>le nom d'abord, puis le type</strong>.`],
  [`daily_rate: float = 0.20`, `<code>= 0.20</code> est une <strong>valeur par défaut</strong>. L'appelant peut omettre ce paramètre. Python ne connaît pas la surcharge de méthodes : on utilise les valeurs par défaut à la place.`],
  [`-> float:`, `<code>-&gt;</code> annonce le <strong>type de retour</strong>. Le <code>:</code> ouvre le corps de la fonction. Une fonction sans retour s'annote <code>-&gt; None</code> (≈ <code>void</code>).`],
  [`"""Calcule la pénalité..."""`, `Une chaîne placée en première ligne du corps est la <strong>docstring</strong>, la documentation de la fonction (≈ Javadoc).`],
  [`return days_late * daily_rate`, `<code>return</code> renvoie le résultat. Sans <code>return</code>, une fonction renvoie <code>None</code>.`],
  [`loan_fee(days_late=5, daily_rate=0.5)`, `Les <strong>arguments nommés</strong> rendent l'appel explicite et indépendant de l'ordre des paramètres. On s'en sert beaucoup dans ce tutoriel.`],
])}
${py`
def split_name(full_name: str) -> tuple[str, str]:
    first, last = full_name.split(" ", 1)
    return first, last              # renvoie un tuple : plusieurs valeurs d'un coup


first, last = split_name("Ada Lovelace")


def create_member(*, email: str, full_name: str) -> dict[str, str]:
    return {"email": email, "full_name": full_name}


create_member(email="ada@example.org", full_name="Ada")     # OK
# create_member("ada@example.org", "Ada")   -> TypeError : arguments nommés obligatoires
`}
${explain([
  [`return first, last`, `Renvoyer plusieurs valeurs revient à renvoyer un <strong>tuple</strong>. L'appelant le « déballe » : <code>first, last = split_name(…)</code>.`],
  [`def create_member(*, email: str, ...)`, `Le <code>*</code> seul signifie que <strong>tous les paramètres qui suivent doivent être nommés</strong> à l'appel. C'est très utile pour éviter d'inverser deux <code>str</code> par erreur.`],
])}

<h2>Classes et objets</h2>
${py`
class Book:
    """Un livre du catalogue."""

    def __init__(self, title: str, copies: int = 1) -> None:
        self.title = title                 # attribut d'instance
        self.copies = copies

    def is_available(self) -> bool:        # méthode
        return self.copies > 0

    def lend(self) -> None:
        if not self.is_available():
            raise ValueError(f"Plus d'exemplaire pour {self.title}")
        self.copies -= 1


book = Book("Clean Code", copies=2)        # PAS de "new"
book.lend()
print(book.copies)                         # 1
print(book.is_available())                 # True
`}
${explain([
  [`class Book:`, `Déclare une classe. Le nom est en <code>PascalCase</code>, comme en Java et C#.`],
  [`def __init__(self, title: str, copies: int = 1) -> None:`, `<code>__init__</code> est le <strong>constructeur</strong>. Les noms entourés de doubles underscores (<em>dunder</em>) sont des méthodes « spéciales » que Python appelle automatiquement : ici, lors de <code>Book(…)</code>.`],
  [`self`, `<strong><code>self</code> est l'instance courante (≈ <code>this</code>)</strong>. C'est toujours le premier paramètre d'une méthode, et il faut l'écrire explicitement dans la signature. À l'appel <code>book.lend()</code>, Python le remplit tout seul avec <code>book</code>.`],
  [`self.title = title`, `On <strong>crée</strong> l'attribut <code>title</code> sur l'instance. Il n'y a pas de déclaration de champs séparée : les attributs naissent dans <code>__init__</code>. Dans une méthode, on y accède toujours par <code>self.title</code>, jamais par <code>title</code> seul.`],
  [`def is_available(self) -> bool:`, `Une méthode d'instance : une fonction <code>def</code> écrite <em>dans</em> la classe, dont le premier paramètre est <code>self</code>.`],
  [`raise ValueError(...)`, `<code>raise</code> lève une exception (≈ <code>throw new</code>). <code>ValueError</code> est l'équivalent d'<code>IllegalArgumentException</code>.`],
  [`book = Book("Clean Code", copies=2)`, `On instancie en <strong>appelant la classe</strong> comme une fonction, sans <code>new</code>. On ne passe pas <code>self</code>.`],
])}
${py`
class EBook(Book):                             # EBook hérite de Book
    def __init__(self, title: str, url: str) -> None:
        super().__init__(title, copies=1)      # appelle le constructeur parent
        self.url = url

    def is_available(self) -> bool:            # redéfinit (override) la méthode
        return True


ebook = EBook("Clean Architecture", "https://…")
print(isinstance(ebook, Book))                 # True  (≈ instanceof)
`}
${explain([
  [`class EBook(Book):`, `L'héritage s'écrit entre parenthèses : « EBook hérite de Book » (≈ <code>extends Book</code> ou <code>: Book</code>).`],
  [`super().__init__(title, copies=1)`, `<code>super()</code> donne accès à la classe parente. Ici, on appelle son constructeur (≈ <code>super(…)</code> ou <code>: base(…)</code>).`],
  [`def is_available(self) -> bool:`, `Pour redéfinir une méthode, il suffit de la réécrire avec le même nom. Pas besoin de mot-clé <code>override</code> ni d'annotation <code>@Override</code>.`],
  [`isinstance(ebook, Book)`, `Teste le type à l'exécution (≈ <code>instanceof</code> / <code>is</code>).`],
])}
${callout('java', 'Ce qui change le plus', `
<ul>
  <li><strong>Pas de <code>private</code>/<code>public</code></strong> : tout est public. Un nom qui commence par <code>_</code> signifie, par convention, « détail interne, ne pas toucher ».</li>
  <li><strong>Pas d'interfaces</strong> au sens Java : on utilisera <code>Protocol</code> à l'étape suivante.</li>
  <li><strong>Pas de <code>new</code></strong> et <strong><code>self</code> explicite</strong> dans chaque méthode.</li>
  <li>Les getters et setters ne sont pas la norme : on accède directement à <code>book.title</code>. Pour un attribut calculé, on utilisera <code>@property</code>.</li>
</ul>`)}

<h2>Exceptions</h2>
${py`
try:
    copies = int("trois")              # lève ValueError : ce n'est pas un nombre
except ValueError as exc:              # ≈ catch (IllegalArgumentException exc)
    print(f"Saisie invalide : {exc}")
    copies = 0
finally:
    print("toujours exécuté")
`}
${explain([
  [`try:`, `Ouvre le bloc protégé, comme en Java.`],
  [`except ValueError as exc:`, `<code>except</code> correspond à <code>catch</code>. <code>as exc</code> donne un nom à l'exception attrapée pour pouvoir l'utiliser dans le bloc.`],
  [`finally:`, `Ce bloc s'exécute dans tous les cas. Toutes les exceptions Python sont <em>unchecked</em> : aucune clause <code>throws</code> n'existe.`],
])}

<h2>Modules et imports</h2>
<p>Chaque fichier <code>.py</code> est un <strong>module</strong>, et un dossier de modules est un <strong>package</strong>. Les points d'un import suivent les dossiers :</p>
${tree(`
src/biblio/
├── __init__.py          # fait de "biblio" un package
└── domain/
    ├── __init__.py
    └── entities.py      # module biblio.domain.entities  (contient class Book)
`)}
${py`
import asyncio                                  # importe le module entier
asyncio.run(main())                             # -> on préfixe : asyncio.xxx

from biblio.domain.entities import Book         # importe UN nom du module
book = Book("DDD")                              # -> utilisable directement

from datetime import datetime as dt             # "as" : alias local
`}
${explain([
  [`import asyncio`, `Importe le module <code>asyncio</code>. On accède ensuite à son contenu avec <code>asyncio.quelque_chose</code>.`],
  [`from biblio.domain.entities import Book`, `Importe uniquement la classe <code>Book</code> du fichier <code>biblio/domain/entities.py</code>. C'est la forme la plus courante, proche de <code>import biblio.domain.entities.Book;</code>.`],
  [`as dt`, `<code>as</code> donne un alias local au nom importé.`],
])}
${py`
def main() -> None:
    print("Lancement")


if __name__ == "__main__":     # vrai seulement si le fichier est exécuté directement
    main()
`}
${explain([
  [`if __name__ == "__main__":`, `<code>__name__</code> contient le nom du module. Il vaut <code>"__main__"</code> quand on lance ce fichier avec <code>python fichier.py</code>, et autre chose quand le fichier est importé. Cet idiome joue le rôle de <code>public static void main</code>.`],
])}

<h2>Décorateurs : la ligne @…</h2>
<p>Tu verras partout des lignes commençant par <code>@</code> au-dessus d'une fonction ou d'une classe. Elles ressemblent aux annotations Java ou aux attributs C#, mais elles sont <strong>exécutées</strong> :
un décorateur est une fonction qui reçoit la fonction décorée et la modifie ou l'enregistre quelque part.</p>
${py`
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")          # enregistre la fonction ci-dessous comme route GET /health
def health() -> dict[str, str]:
    return {"status": "ok"}
`}
${explain([
  [`app = FastAPI()`, `Crée l'objet application FastAPI (on instancie la classe <code>FastAPI</code>, sans <code>new</code>).`],
  [`@app.get("/health")`, `Le décorateur <code>app.get(…)</code> enregistre la fonction en dessous comme le gestionnaire de <code>GET /health</code>. C'est l'équivalent de <code>@GetMapping("/health")</code> ou de <code>[HttpGet("/health")]</code>.`],
  [`def health() -> dict[str, str]:`, `Une fonction ordinaire. FastAPI convertit automatiquement le <code>dict</code> renvoyé en JSON : <code>{"status": "ok"}</code>.`],
])}

<h2>Lire une signature « réelle »</h2>
<p>Avec ces bases, tu peux déjà décoder une ligne typique de la suite du tutoriel :</p>
${py`
async def get_book(book_id: UUID, use_case: GetBookDep) -> BookRead:
    book = await use_case.execute(book_id)
    return BookRead.from_entity(book)
`}
${explain([
  [`async def`, `Déclare une fonction <strong>asynchrone</strong> (une coroutine), comme <code>async Task&lt;BookRead&gt;</code> en C#. On la détaille à l'étape suivante.`],
  [`get_book(book_id: UUID, use_case: GetBookDep)`, `Deux paramètres : <code>book_id</code> de type <code>UUID</code>, et <code>use_case</code> de type <code>GetBookDep</code>. Ce dernier est un type « annoté » qui demande à FastAPI d'injecter la dépendance, un peu comme <code>@Autowired</code>.`],
  [`-> BookRead:`, `La fonction renvoie un <code>BookRead</code> (un DTO de réponse).`],
  [`await use_case.execute(book_id)`, `Appelle la méthode <code>execute</code> et <strong>attend</strong> son résultat sans bloquer le serveur.`],
  [`BookRead.from_entity(book)`, `Appelle une méthode de fabrique définie sur la classe <code>BookRead</code> (une <code>@classmethod</code>, ≈ méthode <code>static</code>).`],
])}

${compare(['Python', 'Java', 'C#'], [
  ['<code>x = 3</code>', '<code>var x = 3;</code>', '<code>var x = 3;</code>'],
  ['<code>def f(a: int) -&gt; str:</code>', '<code>String f(int a) {</code>', '<code>string F(int a) {</code>'],
  ['<code>class B(A):</code>', '<code>class B extends A {</code>', '<code>class B : A {</code>'],
  ['<code>def __init__(self, …):</code>', 'constructeur', 'constructeur'],
  ['<code>self</code>', '<code>this</code>', '<code>this</code>'],
  ['<code>Book("DDD")</code>', '<code>new Book("DDD")</code>', '<code>new Book("DDD")</code>'],
  ['<code>None</code>, <code>True</code>, <code>False</code>', '<code>null</code>, <code>true</code>, <code>false</code>', 'idem Java'],
  ['<code>and</code>, <code>or</code>, <code>not</code>', '<code>&amp;&amp;</code>, <code>||</code>, <code>!</code>', 'idem Java'],
  ['<code>for x in items:</code>', '<code>for (var x : items)</code>', '<code>foreach (var x in items)</code>'],
  ['<code>raise E(…)</code> / <code>except E as e:</code>', '<code>throw new E(…)</code> / <code>catch (E e)</code>', 'idem Java'],
  ['<code>f"{x}"</code>', '<code>String.format</code>', '<code>$"{x}"</code>'],
  ['<code>len(items)</code>', '<code>items.size()</code>', '<code>items.Count</code>'],
])}
`,
  exercise: {
    title: 'Un mini-catalogue en script',
    statement: `
<p>Crée un fichier <code>catalogue.py</code> et lance-le avec <code>uv run python catalogue.py</code>. Il doit :</p>
<ol>
  <li>définir une classe <code>Book</code> avec <code>title: str</code>, <code>author: str</code> et <code>copies: int</code> ;</li>
  <li>lui ajouter une méthode <code>is_available(self) -&gt; bool</code> ;</li>
  <li>définir une fonction <code>available_titles(books: list[Book]) -&gt; list[str]</code> qui renvoie les titres des livres disponibles ;</li>
  <li>créer une liste de trois livres (dont un sans exemplaire), puis afficher « <code>2 livre(s) disponible(s) : Clean Code, DDD</code> ».</li>
</ol>`,
    hints: [
      "Le constructeur s'écrit <code>def __init__(self, title: str, author: str, copies: int) -&gt; None:</code> et range chaque paramètre dans <code>self.xxx</code>.",
      "Une compréhension <code>[b.title for b in books if b.is_available()]</code> fait tout le travail de <code>available_titles</code>.",
      "<code>\", \".join(titles)</code> assemble une liste de chaînes avec un séparateur.",
    ],
    solution: `
${py.file('catalogue.py')`
class Book:
    def __init__(self, title: str, author: str, copies: int) -> None:
        self.title = title
        self.author = author
        self.copies = copies

    def is_available(self) -> bool:
        return self.copies > 0


def available_titles(books: list[Book]) -> list[str]:
    return [book.title for book in books if book.is_available()]


def main() -> None:
    books = [
        Book("Clean Code", "Robert C. Martin", copies=2),
        Book("Refactoring", "Martin Fowler", copies=0),
        Book("DDD", "Eric Evans", copies=1),
    ]
    titles = available_titles(books)
    print(f"{len(titles)} livre(s) disponible(s) : {', '.join(titles)}")


if __name__ == "__main__":
    main()
`}
${explain([
  [`[book.title for book in books if book.is_available()]`, `Une compréhension de liste : le titre de chaque livre, pour les livres disponibles.`],
  [`f"{len(titles)} livre(s) ... {', '.join(titles)}"`, `Une f-string peut contenir n'importe quelle expression entre accolades, y compris des appels de fonction.`],
  [`if __name__ == "__main__":`, `<code>main()</code> n'est appelée que si le fichier est lancé directement, pas s'il est importé (par un test, par exemple).`],
])}
<p>À l'étape suivante, on réécrira cette classe beaucoup plus brièvement avec <code>@dataclass</code>, qui génère le constructeur à notre place.</p>`,
  },
  quiz: [
    {
      q: 'Comment Python délimite-t-il un bloc de code (corps d\'un <code>if</code>, d\'une fonction…) ?',
      options: ['Avec des accolades <code>{ }</code>', 'Avec <code>begin</code> / <code>end</code>', "Par l'indentation, après une ligne terminée par <code>:</code>", 'Avec des points-virgules'],
      answer: 2,
      explain: "L'indentation fait partie de la syntaxe : toutes les lignes décalées (4 espaces) après le <code>:</code> forment le bloc.",
    },
    {
      q: 'Que représente <code>self</code> dans <code>def lend(self) -&gt; None:</code> ?',
      options: ["La classe elle-même", "L'instance sur laquelle la méthode est appelée (≈ <code>this</code>)", 'Un mot-clé qui rend la méthode privée', 'Le module courant'],
      answer: 1,
      explain: "<code>self</code> est le premier paramètre de toute méthode d'instance. <code>book.lend()</code> appelle <code>lend</code> avec <code>self = book</code>.",
    },
    {
      q: 'Comment crée-t-on une instance de la classe <code>Book</code> ?',
      options: ['<code>new Book("DDD")</code>', '<code>Book("DDD")</code>', '<code>Book.new("DDD")</code>', '<code>create Book("DDD")</code>'],
      answer: 1,
      explain: 'On appelle la classe comme une fonction. Python exécute alors <code>__init__</code>.',
    },
    {
      q: 'Dans <code>def loan_fee(days_late: int, rate: float = 0.2) -&gt; float:</code>, que signifie <code>-&gt; float</code> ?',
      options: ['Que le paramètre <code>rate</code> est un float', 'Que la fonction renvoie un float', 'Une conversion automatique en float', 'Un pointeur vers un float'],
      answer: 1,
      explain: "<code>-&gt;</code> annonce le type de retour. Les paramètres sont annotés avec <code>nom: type</code>.",
    },
    {
      q: 'Que vaut <code>[b for b in [1, 2, 3, 4] if b % 2 == 0]</code> ?',
      options: ['<code>[1, 3]</code>', '<code>[2, 4]</code>', '<code>[True, False, True, False]</code>', '<code>2</code>'],
      answer: 1,
      explain: "C'est une compréhension de liste qui garde chaque élément <code>b</code> dont le reste de la division par 2 vaut 0 : les nombres pairs.",
    },
    {
      q: 'Comment teste-t-on correctement si une variable vaut <code>None</code> ?',
      options: ['<code>if x == null:</code>', '<code>if x is None:</code>', '<code>if x === None:</code>', '<code>if isNone(x):</code>'],
      answer: 1,
      explain: "<code>None</code> est un objet unique : on teste l'identité avec <code>is</code>. <code>null</code> n'existe pas en Python.",
    },
    {
      q: 'Que fait <code>from biblio.domain.entities import Book</code> ?',
      options: [
        'Copie le fichier <code>entities.py</code> dans le module courant',
        'Rend la classe <code>Book</code>, définie dans <code>biblio/domain/entities.py</code>, utilisable directement sous le nom <code>Book</code>',
        "Crée une instance de <code>Book</code>",
        'Hérite de la classe <code>Book</code>',
      ],
      answer: 1,
      explain: "Les points suivent l'arborescence des dossiers du package. <code>from … import Nom</code> importe un nom précis du module.",
    },
    {
      q: 'Que se passe-t-il à l\'exécution si on écrit <code>copies: int = "trois"</code> ?',
      options: [
        'Une erreur de compilation',
        'Une <code>TypeError</code> immédiate',
        "Rien : Python ignore l'annotation. C'est mypy qui signalera l'erreur",
        'La chaîne est convertie en entier',
      ],
      answer: 2,
      explain: "Les annotations ne sont pas vérifiées par l'interpréteur. D'où l'importance de lancer <code>mypy</code>, qui joue le rôle du compilateur.",
    },
  ],
});
