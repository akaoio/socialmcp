class sch {
  constructor(d) { this.d = d; }

  describe(t)  { return new sch({ ...this.d, description: t }); }
  optional()   { return new sch({ ...this.d, optional: true }); }
  int()        { return new sch({ ...this.d, integer: true }); }
  min(n)       { return new sch({ ...this.d, minimum: n }); }
  max(n)       { return new sch({ ...this.d, maximum: n }); }

  json() {
    const { type, values, items, description, integer, minimum, maximum } = this.d;
    const o = {};
    if (description) o.description = description;
    if      (type === 'string') { o.type = 'string'; }
    else if (type === 'number') {
      o.type = integer ? 'integer' : 'number';
      if (minimum != null) o.minimum = minimum;
      if (maximum != null) o.maximum = maximum;
    }
    else if (type === 'enum')  { o.type = 'string'; o.enum = values; }
    else if (type === 'array') { o.type = 'array';  o.items = items.json(); }
    return o;
  }
}

export const schema = {
  string: ()       => new sch({ type: 'string' }),
  number: ()       => new sch({ type: 'number' }),
  enum:   (values) => new sch({ type: 'enum', values }),
  array:  (items)  => new sch({ type: 'array', items }),
};
