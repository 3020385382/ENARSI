"""Extract only user-copied BGW question content. Never fetch pages or execute HTML."""
from html.parser import HTMLParser
from html import escape
from datetime import datetime
import json,re

class Node:
    def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
    def text(self):return ''.join(c.text() if isinstance(c,Node) else c for c in self.children)
    def walk(self):
        yield self
        for c in self.children:
            if isinstance(c,Node):yield from c.walk()
    def cls(self,name):return name in self.attrs.get('class','').split()
class Parser(HTMLParser):
    def __init__(self):super().__init__();self.root=Node();self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):self.stack.append(n)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,text):self.stack[-1].children.append(text)
def sanitize(node):
    if isinstance(node,str):return escape(node)
    if node.tag=='img':
        src=node.attrs.get('src','')
        if re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+',src):
            return '<img src="'+src+'" alt="'+escape(node.attrs.get('alt','BGW 原筆記附圖'),quote=True)+'">'
        return ''
    if node.tag in ('script','style','iframe','form','input','svg','object','embed'):return ''
    inner=''.join(sanitize(c) for c in node.children);tag=node.tag
    if tag=='button':tag='h3'
    if tag=='span' and re.search('Consolas|monospace',node.attrs.get('style','')):tag='code'
    if tag not in ('p','br','hr','div','span','strong','b','em','i','u','ul','ol','li','table','thead','tbody','tr','td','th','code','pre','h2','h3','h4','blockquote','a'):return inner
    attrs=''
    if tag=='a' and node.attrs.get('href','').startswith('https://'):attrs=' href="'+escape(node.attrs['href'],quote=True)+'" target="_blank" rel="noopener noreferrer"'
    return '<'+tag+attrs+'>'+inner+('</'+tag+'>' if tag not in ('br','hr') else '')
def normal(s):return re.sub(r'[^a-z0-9\u4e00-\u9fff]','',s.lower())
def unwrap_source(source):
    """Recover the original text from a saved Chromium view-source document."""
    p=Parser();p.feed(source)
    lines=[n.text() for n in p.root.walk() if n.cls('line-content')]
    return '\n'.join(lines) if lines else source
def extract(source,questions):
    if len(source)>3_000_000:raise ValueError('一次請複製一題。')
    source=unwrap_source(source)
    p=Parser();p.feed(source);nodes=list(p.root.walk())
    en=next((n.text().strip() for n in nodes if n.cls('question-text') and not n.cls('question-text-zh')),'')
    if not en:raise ValueError('找不到題幹。請複製該題的完整網頁原始碼。')
    match=next((q for q in questions if normal(q['stem'])==normal(en)),None)
    if not match:match=next((q for q in questions if len(normal(en))>30 and normal(q['stem']).startswith(normal(en))),None)
    if not match:raise ValueError('目前題庫沒有對應題幹，未儲存。')
    find=lambda cls:next((n for n in nodes if n.cls(cls)),None)
    zh=find('question-text-zh');content=find('note-content');options={}
    for n in nodes:
        if n.cls('choice-row'):
            ch=list(n.walk());label=next((x.text().strip().rstrip('.') for x in ch if x.cls('choice-label')),'');val=next((x.text().strip() for x in ch if x.cls('choice-text-zh')),'')
            if re.fullmatch('[A-H]',label) and val:options[label]=val
    note=dict(id=match['id'],stemZh=zh.text().strip() if zh else '',optionsZh=options,html=sanitize(content) if content else '',source='BGW 原文（使用者複製的網頁）',imported=datetime.now().isoformat(timespec='seconds'),english=en)
    script=next((n for n in nodes if n.attrs.get('id')=='practice-correct-drag'),None)
    if script:
        try:
            d=json.loads(script.text())
            if d and d.get('type') in ('drag_category','drag_match') and isinstance(d.get('pairs'),list):
                pairs=d['pairs']
                if pairs and all(isinstance(p,list) and len(p)==2 and all(isinstance(s,str) for s in p) for p in pairs) and len({p[1] for p in pairs})==len(pairs):note['drag']=dict(type=d['type'],pairs=pairs)
        except (ValueError,TypeError):pass
    if not note['stemZh'] and not note['html'] and not note.get('drag'):raise ValueError('題目中沒有可擷取的中文或配對資料。')
    return note
def merge(old,n):
    prior=old.get(n['id'],{});result={**prior,**n}
    for key in ('stemZh','html'):result[key]=n.get(key) or prior.get(key,'')
    result['optionsZh']={**prior.get('optionsZh',{}),**n.get('optionsZh',{})}
    if not n.get('drag') and prior.get('drag'):result['drag']=prior['drag']
    old[n['id']]=result;return old
