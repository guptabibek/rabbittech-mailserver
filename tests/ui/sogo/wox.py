#!/usr/bin/env python3
"""A small WOx renderer: turns SOGo's .wox templates into the HTML text SOGo sends.

It follows what SOPE (sope-appserver/NGObjWeb, the framework SOGo runs on) does when it
renders a template, because the browser's HTML parser has to see the same text:
  - comments are not delivered (WOxElemBuilder buildComment returns nil);
  - an element with no child node at all is written XML-style, <tag ... /> (WOGenericElement),
    which the HTML parser reads as a start tag that is never closed;
  - text and the attributes of plain elements are escaped with appendContentHTMLString
    (& < > and every non-ASCII character as &#N;, quotes and newlines left as they are);
  - <a>, <form>, <input>, <textarea> and <body> are dynamic elements in SOPE: they add their
    own attributes (method="post", name="...", value="...") and escape the others as attribute
    values (&quot; &#10; ...);
  - <script type="text/ng-template"> blocks nested in other ones are written as they are, so
    the browser ends the outer script at the first inner </script>, exactly like in production.

Bindings (var:...) and conditions (var:if) come from a plain dict; a value can be a function of
the current scope. Python 3 standard library only.

Usage as a script: wox.py <templates dir> <strings file>... -- <Component> renders a component
with no bindings (handy to look at a template)."""
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import ChainMap

XHTML = 'http://www.w3.org/1999/xhtml'
NAMESPACES = {
    XHTML: '',
    'http://www.skyrix.com/od/binding': 'var',
    'http://www.skyrix.com/od/constant': 'const',
    'OGo:url': 'rsrc',
    'OGo:label': 'label',
    'OGo:bool': 'bool',
    'http://www.w3.org/XML/1998/namespace': 'xml',
}
RESOURCES_URL = '/SOGo.woa/WebServerResources/'
# <input> types SOPE renders with WOTextField (WOxHTMLElemBuilder classForInputElement)
TEXT_FIELD_TYPES = {'', 'text', 'url', 'date', 'email', 'search', 'number'}


# ------------------------------------------------------------------ escaping (NGExtensions)
def _big(ch):
    return '&#%d;' % ord(ch)


def escape_text(value):
    """NSString stringByEscapingHTMLString: & < > and non-ASCII characters."""
    out = []
    for ch in value:
        if ch == '&':
            out.append('&amp;')
        elif ch == '<':
            out.append('&lt;')
        elif ch == '>':
            out.append('&gt;')
        elif ord(ch) > 127:
            out.append(_big(ch))
        else:
            out.append(ch)
    return ''.join(out)


_ATTR = {'&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;'}


def escape_attr(value):
    """NSString stringByEscapingHTMLAttributeValue."""
    return ''.join(_ATTR.get(ch) or (_big(ch) if ord(ch) > 127 else ch) for ch in value)


def string_value(value):
    """How an Objective-C value prints: BOOLs as 1/0, nil as nothing."""
    if value is None:
        return None
    if value is True:
        return '1'
    if value is False:
        return '0'
    return str(value)


# ------------------------------------------------------------------ Localizable.strings
def read_strings(path):
    """Parses a GNUstep .strings file ("key" = "value";) into an ordered dict."""
    text = open(path, encoding='utf-8').read()
    strings = {}
    token = re.compile(r'/\*.*?\*/|//[^\n]*|"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;', re.S)
    for match in token.finditer(text):
        if match.group(1) is not None:
            strings[_unescape(match.group(1))] = _unescape(match.group(2))
    return strings


def _unescape(s):
    def repl(m):
        c = m.group(1)
        if c[0] in 'uU':
            return chr(int(c[1:], 16))
        return {'n': '\n', 't': '\t', 'r': '\r'}.get(c, c)
    return re.sub(r'\\([uU][0-9a-fA-F]{4}|.)', repl, s)


# ------------------------------------------------------------------ renderer
class Renderer:
    """Renders components found under template_dirs. strings is a list of dicts searched in
    order for label: lookups; bindings is the dict for var: lookups and var:if conditions.
    accessors maps a component name to a function that gets the bindings passed to that
    component (<var:component className="X" title="..."/>) and returns values it computes
    from them, like UIxPageFrame's title."""

    def __init__(self, template_dirs, strings, bindings, accessors=None):
        self.templates = {}
        for directory in template_dirs:
            for base, _, files in os.walk(directory):
                for name in files:
                    if name.endswith('.wox'):
                        self.templates.setdefault(name[:-4], os.path.join(base, name))
        self.strings = strings
        self.scope = ChainMap(dict(bindings))
        self.accessors = accessors or {}
        self.content = []          # stack of <var:component-content/> callbacks
        self.element_ids = 0
        self.missing = set()       # var: bindings that had no value (reported, then omitted)

    # -------------------------------------------------------------- lookups
    def label(self, key):
        for table in self.strings:
            if key in table:
                return table[key]
        return key

    def value(self, keypath):
        if keypath in self.scope:
            value = self.scope[keypath]
            return value(self.scope) if callable(value) else value
        self.missing.add(keypath)
        return None

    def element_id(self):
        # Form element names SOPE derives from the element ID when there is no name attribute
        self.element_ids += 1
        return '0.0.%d' % self.element_ids

    def parse(self, name):
        if name not in self.templates:
            raise KeyError('no template %s.wox' % name)
        parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
        return ET.parse(self.templates[name], parser).getroot()

    # -------------------------------------------------------------- components
    def render_component(self, name, bindings=None, content=None):
        """The text of component `name`. A root <var:component className="X"> wraps the
        children in X (like UIxPageFrame); a root <container> renders its children only."""
        root = self.parse(name)
        bindings = dict(bindings or {})
        if name in self.accessors:
            bindings.update(self.accessors[name](bindings))
        self.scope = self.scope.new_child(bindings)
        self.content.append(content)
        try:
            if self._kind(root) == ('var', 'component'):
                return self._component(root)
            if self._kind(root) == ('', 'container'):
                return self._children(root)
            return self._node(root)
        finally:
            self.content.pop()
            self.scope = self.scope.parents

    def _component(self, el):
        """<var:component className="X" a="binding" const:b="literal"> inside a template."""
        bindings = {}
        for key, val in el.attrib.items():
            ns, local = self._split(key)
            if local == 'className' and ns == '':
                continue
            if ns == 'const':
                bindings[local] = val
            elif ns in ('', 'var'):
                bindings[local] = self.value(val)
        children = list(el)
        has_content = bool(children) or bool((el.text or '').strip())
        content = (lambda: self._children(el)) if has_content else None
        return self.render_component(el.get('className'), bindings, content)

    # -------------------------------------------------------------- nodes
    @staticmethod
    def _split(name):
        if name.startswith('{'):
            uri, local = name[1:].split('}', 1)
            return NAMESPACES.get(uri, uri), local
        return '', name

    def _kind(self, el):
        if el.tag is ET.Comment:
            return ('comment', '')
        return self._split(el.tag)

    def _children(self, el):
        out = [escape_text(el.text)] if el.text else []
        for child in el:
            out.append(self._node(child))
            if child.tail:
                out.append(escape_text(child.tail))
        return ''.join(out)

    @staticmethod
    def _has_child_nodes(el):
        # Whitespace and comments count: SOPE's SAX driver keeps them as DOM nodes
        return bool(el.text) or len(el) > 0

    def _node(self, el):
        ns, tag = self._kind(el)
        if ns == 'comment':
            return ''
        if ns == 'var':
            return self._var(tag, el)
        if ns != '':
            raise ValueError('unknown element namespace in %s' % el.tag)
        if tag == 'container':
            return self._children(el)
        attrs = self._attributes(el)
        if tag == 'a' and 'name' not in attrs:
            return self._hyperlink(el, attrs)
        if tag == 'form':
            return self._form(el, attrs)
        if tag == 'input':
            return self._input(attrs)
        if tag == 'textarea':
            return self._textarea(attrs)
        if tag == 'body':
            return '<body%s>%s</body>' % (self._extra(attrs), self._children(el))
        # WOGenericContainer / WOGenericElement
        out = '<' + tag + ''.join(
            ' ' + k if v is True else ' %s="%s"' % (k, escape_text(v)) for k, v in attrs.items())
        if self._has_child_nodes(el):
            return out + '>' + self._children(el) + '</' + tag + '>'
        return out + ' />'

    def _attributes(self, el):
        """Attribute name -> string value, or True for a bool: attribute that is set."""
        attrs = {}
        for key, val in el.attrib.items():
            ns, local = self._split(key)
            if ns == 'xml':
                attrs['xml:' + local] = val
            elif ns in ('', 'const'):
                attrs[local] = val
            elif ns == 'label':
                attrs[local] = self.label(val)
            elif ns == 'rsrc':
                attrs[local] = RESOURCES_URL + val
            elif ns == 'var':
                value = string_value(self.value(val))
                if value is not None:
                    attrs[local] = value
            elif ns == 'bool':
                if self.value(val):
                    attrs[local] = True
            else:
                raise ValueError('unknown attribute namespace in %s' % key)
        return attrs

    @staticmethod
    def _extra(attrs):
        # WODynamicElement appendExtraAttributesToResponse
        return ''.join(' ' + k if v is True else ' %s="%s"' % (k, escape_attr(v)) for k, v in attrs.items())

    # -------------------------------------------------------------- SOPE dynamic elements
    def _hyperlink(self, el, attrs):
        href = attrs.pop('href', None)
        target = attrs.pop('target', None)
        out = '<a'
        if href is not None:
            out += ' href="%s"' % escape_attr(href)
        if target is not None:
            out += ' target="%s"' % target
        return out + self._extra(attrs) + '>' + self._children(el) + '</a>'

    def _form(self, el, attrs):
        method = attrs.pop('method', 'post')
        for key in ('href', 'action', 'directActionName', 'actionClass'):
            attrs.pop(key, None)
        return '<form method="%s"%s>%s</form>' % (method, self._extra(attrs), self._children(el))

    def _input(self, attrs):
        kind = attrs.get('type', '')
        if kind in TEXT_FIELD_TYPES:
            attrs.pop('type', None)
            name = attrs.pop('name', None) or self.element_id()
            value = attrs.pop('value', None) or ''
            size = attrs.pop('size', None)
            out = '<input type="%s" name="%s" value="%s"' % (escape_attr(kind or 'text'), escape_attr(name), escape_attr(value))
            if size:
                out += ' size="%s"' % size
            return out + self._extra(attrs) + ' />'
        if kind == 'file':
            attrs.pop('type')
            name = attrs.pop('name', None) or self.element_id()
            value = attrs.pop('value', None)
            out = '<input type="file" name="%s"' % escape_attr(name)
            if value is not None:
                out += ' value="%s"' % escape_attr(value)
            return out + self._extra(attrs) + ' />'
        return '<input' + ''.join(
            ' ' + k if v is True else ' %s="%s"' % (k, escape_text(v)) for k, v in attrs.items()) + ' />'

    def _textarea(self, attrs):
        name = attrs.pop('name', None) or self.element_id()
        value = attrs.pop('value', None) or ''
        out = '<textarea name="%s"' % escape_attr(name)
        for key in ('rows', 'cols'):
            if attrs.get(key, '').isdigit() and int(attrs[key]) > 0:
                out += ' %s="%s"' % (key, attrs.pop(key))
            else:
                attrs.pop(key, None)
        return out + self._extra(attrs) + '>' + escape_text(value) + '</textarea>'

    # -------------------------------------------------------------- var: elements
    def _var(self, tag, el):
        if tag == 'string':
            return self._string(el)
        if tag == 'if':
            return self._children(el) if self._condition(el) else ''
        if tag == 'if-ie':
            return ''          # the browser is never Internet Explorer here
        if tag == 'foreach':
            return self._foreach(el)
        if tag == 'component':
            return self._component(el)
        if tag == 'component-content':
            content = self.content[-1] if self.content else None
            return content() if content else ''
        raise ValueError('unsupported element var:%s' % tag)

    def _string(self, el):
        value = None
        for key, val in el.attrib.items():
            ns, local = self._split(key)
            if local != 'value':
                continue
            if ns == 'label':
                value = self.label(val)
            elif ns == 'const':
                value = val
            else:
                value = string_value(self.value(val))
        if value is None:
            return ''
        escape = el.get('{http://www.skyrix.com/od/constant}escapeHTML', 'YES').upper() != 'NO'
        return escape_text(value) if escape else value

    def _condition(self, el):
        value = self.value(el.get('condition'))
        compare = el.get('{http://www.skyrix.com/od/constant}value')
        result = (string_value(value) == compare) if compare is not None else bool(value)
        if el.get('{http://www.skyrix.com/od/constant}negate', 'NO').upper() == 'YES':
            result = not result
        return result

    def _foreach(self, el):
        items = self.value(el.get('list')) or []
        name = el.get('item')
        out = []
        for item in items:
            self.scope = self.scope.new_child({name: item})
            try:
                out.append(self._children(el))
            finally:
                self.scope = self.scope.parents
        return ''.join(out)


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--' not in args or len(args) < 3:
        sys.exit(__doc__)
    split = args.index('--')
    templates, string_files, component = args[0], args[1:split], args[split + 1]
    renderer = Renderer([templates], [read_strings(f) for f in string_files], {})
    sys.stdout.write(renderer.render_component(component))
    if renderer.missing:
        sys.stderr.write('bindings without a value: %s\n' % ', '.join(sorted(renderer.missing)))
