// lexicon.js: small word lists for the Bahasa Rojak Score and Word of the Year.
// Deliberately tiny and transparent. No topic detection (health, politics, religion) on purpose.

export const MALAY = new Set(`
aku kau ko engkau saya awak kita kami dia diorang dorang mereka korang kamu
tak tk x tidak taknak xnak nak nk mahu hendak dah dh sudah belum blm lagi lg
ni ini tu itu sini sana situ mana apa ape siapa sape bila kenapa knp macam mcm camne macamana
la lah je jer jek kan ke pun tau tahu taw kot kut gak jugak juga pulak plak
yang yg dengan dgn untuk utk dari drp kat dekat dkt pada atas bawah dalam
boleh blh bole buat wat pergi pegi pi gi balik datang dtg tengok tgk nampak
makan minum tidur bangun mandi solat kerja keje rumah umah esok semalam harini hari malam pagi petang tengahari
nanti nnt tadi td dulu sekarang skrg terus trus cepat lambat lmbt sikit banyak byk ramai semua
betul btul salah sangat sgt gila best? takpe takpa xpe xpa okay? jom weh wei woi eh oi adoi alamak aduh
sebab sbb tapi tp kalau klau kalo atau ataupun lepas lps sebelum masa time?
cakap ckp tanya bagi bg ambik ambil beli bayar jumpa tunggu tggu rindu sayang syg suka benci marah penat letih lapar
budak orang org kawan member abang kakak adik mak ayah abah ibu bapak
duit kereta jalan kedai kelas cikgu lecturer? assignment? exam? ujian
baik bagus cantik hensem comel teruk susah senang mudah
`.trim().split(/\s+/).filter((w) => !w.endsWith('?')));

export const ENGLISH = new Set(`
the a an and or but so because if then than that this these those there here
i me my mine you your yours he him his she her we us our they them their it its
is are was were be been being am do does did done have has had will would shall should can could may might must
what when where why who whom which how
not no yes yeah yep nope okay ok
just really very much many more most some any all every each also too only even still already
like love hate want need know think feel see look go going gonna wanna gotta come get got make made take
good bad great nice cool fine sure maybe actually literally honestly basically
today tomorrow yesterday tonight morning night time day week month year
sorry thanks thank please welcome
people person friend guy girl guys
eat sleep work home school class
with for from about into onto over under after before again
`.trim().split(/\s+/));

const EXTRA_STOP = new Set(`
omitted media image video audio sticker deleted message edited attached file null http https www com
haha hahaha hehe wkwk lol lmao
`.trim().split(/\s+/));

export const STOPWORDS = new Set([...MALAY, ...ENGLISH, ...EXTRA_STOP]);

export const LAUGH_STYLES = [
  { key: 'haha', label: 'hahaha', re: /(^|[^a-z])h?(?:ha){2,}h?(?![a-z])/i },
  { key: 'hehe', label: 'hehehe', re: /(^|[^a-z])(?:he){2,}h?(?![a-z])/i },
  { key: 'wkwk', label: 'wkwkwk', re: /(^|[^a-z])w?k?(?:wk){2,}w?(?![a-z])/i },
  { key: 'lol', label: 'lol', re: /(^|[^a-z])lo+l(?![a-z])/i },
  { key: 'lmao', label: 'lmao', re: /(^|[^a-z])lmf?a+o+(?![a-z])/i },
  { key: 'smash', label: 'HAHSJSKDJ', re: /(^|[^a-z])(?=[a-z]*[sjdk])[ahsjdkgl]{8,}(?![a-z])/i },
  { key: 'cry', label: '😂', re: /😂/u },
  { key: 'rofl', label: '🤣', re: /🤣/u },
  { key: 'skull', label: '💀', re: /💀/u },
];

export const SORRY_RE = /(^|[^a-z])(sorry|sorryy+|sori|soryy|maaf|my bad|apologi[sz]e)(?![a-z])/i;
export const THANKS_RE = /(^|[^a-z])(thanks|thank you|thank u|thx|tq|tqvm|ty|terima kasih|makasih|trimas)(?![a-z])/i;
