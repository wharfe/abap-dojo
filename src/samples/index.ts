export interface Sample {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const samples: Sample[] = [
  {
    id: "hello-world",
    title: "Hello World",
    description: "Basic WRITE statement",
    code: `REPORT ztest_hello.

WRITE 'Hello, ABAP Dojo!'.
WRITE / 'Welcome to the playground.'.
`,
  },
  {
    id: "variables-conditions",
    title: "Variables & Conditions",
    description: "DATA declarations, IF/CASE",
    code: `REPORT ztest_cond.

DATA lv_score TYPE i VALUE 85.
DATA lv_grade TYPE c LENGTH 1.

IF lv_score >= 90.
  lv_grade = 'A'.
ELSEIF lv_score >= 80.
  lv_grade = 'B'.
ELSEIF lv_score >= 70.
  lv_grade = 'C'.
ELSE.
  lv_grade = 'F'.
ENDIF.

WRITE: 'Score:', lv_score.
WRITE: / 'Grade:', lv_grade.

CASE lv_grade.
  WHEN 'A'.
    WRITE / 'Excellent!'.
  WHEN 'B'.
    WRITE / 'Good job!'.
  WHEN OTHERS.
    WRITE / 'Keep trying!'.
ENDCASE.
`,
  },
  {
    id: "internal-tables",
    title: "Internal Tables",
    description: "LOOP AT, APPEND, READ TABLE",
    code: `REPORT ztest_itab.

TYPES: BEGIN OF ty_person,
         name TYPE string,
         age  TYPE i,
       END OF ty_person.

DATA lt_people TYPE STANDARD TABLE OF ty_person WITH DEFAULT KEY.
DATA ls_person TYPE ty_person.

ls_person-name = 'Alice'.
ls_person-age = 30.
APPEND ls_person TO lt_people.

ls_person-name = 'Bob'.
ls_person-age = 25.
APPEND ls_person TO lt_people.

ls_person-name = 'Charlie'.
ls_person-age = 35.
APPEND ls_person TO lt_people.

LOOP AT lt_people INTO ls_person.
  WRITE: / ls_person-name, ls_person-age.
ENDLOOP.

WRITE: / 'Total:', LINES( lt_people ), 'people'.
`,
  },
  {
    id: "string-processing",
    title: "String Processing",
    description: "CONCATENATE, && operator",
    code: `REPORT ztest_string.

DATA lv_first TYPE string VALUE 'Hello'.
DATA lv_last  TYPE string VALUE 'World'.
DATA lv_result TYPE string.

* Concatenation with &&
lv_result = lv_first && ' ' && lv_last.
WRITE lv_result.

* CONCATENATE statement
CONCATENATE lv_first lv_last INTO lv_result SEPARATED BY ', '.
WRITE / lv_result.

* String length
WRITE: / 'Length:', STRLEN( lv_result ).

* Case conversion
TRANSLATE lv_result TO UPPER CASE.
WRITE: / 'Upper:', lv_result.

TRANSLATE lv_result TO LOWER CASE.
WRITE: / 'Lower:', lv_result.
`,
  },
  {
    id: "oo-basics",
    title: "OO Basics",
    description: "CLASS definition, methods",
    code: `REPORT ztest_oo.

CLASS lcl_calculator DEFINITION.
  PUBLIC SECTION.
    METHODS add
      IMPORTING iv_a TYPE i
                iv_b TYPE i
      RETURNING VALUE(rv_result) TYPE i.
    METHODS multiply
      IMPORTING iv_a TYPE i
                iv_b TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS lcl_calculator IMPLEMENTATION.
  METHOD add.
    rv_result = iv_a + iv_b.
  ENDMETHOD.
  METHOD multiply.
    rv_result = iv_a * iv_b.
  ENDMETHOD.
ENDCLASS.

DATA lo_calc TYPE REF TO lcl_calculator.

CREATE OBJECT lo_calc.

DATA lv_sum TYPE i.
DATA lv_product TYPE i.

lv_sum = lo_calc->add( iv_a = 10 iv_b = 20 ).
lv_product = lo_calc->multiply( iv_a = 5 iv_b = 6 ).

WRITE: 'Sum:', lv_sum.
WRITE: / 'Product:', lv_product.
`,
  },
  {
    id: "modern-syntax",
    title: "Modern Syntax",
    description: "Inline declarations, VALUE, NEW",
    code: `REPORT ztest_modern.

* Note: modern syntax features require ABAP 7.40+
* The transpiler may apply downport rules automatically.

CLASS lcl_calculator DEFINITION.
  PUBLIC SECTION.
    METHODS double
      IMPORTING iv_val TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS lcl_calculator IMPLEMENTATION.
  METHOD double.
    rv_result = iv_val * 2.
  ENDMETHOD.
ENDCLASS.

DATA lo_calc TYPE REF TO lcl_calculator.

CREATE OBJECT lo_calc.

DATA lv_result TYPE i.
lv_result = lo_calc->double( 21 ).
WRITE: 'Double of 21:', lv_result.
`,
  },
];
