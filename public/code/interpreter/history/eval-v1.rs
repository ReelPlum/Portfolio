fn eval(expr: &Expr, env: &Env) -> Value {
    match expr {
        Expr::Number(n) => Value::Number(*n),
        Expr::Var(name) => env.get(name).unwrap().clone(),
        Expr::Binary(op, l, r) => {
            let l = eval(l, env);
            let r = eval(r, env);
            apply(op, l, r)
        }
    }
}
