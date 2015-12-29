/*
  This file is part of Widgsock.

  Widgsock is free software: you can redistribute it and/or modify
  it under the terms of the GNU Lesser General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Widgsock is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public License
  along with Widgsock.  If not, see <http://www.gnu.org/licenses/>. 

  Copyright 2015 Florent Jugla <florent@jugla.name>
*/

(function(exports) {

  var apps = {};
  var widgets = {};
  var connected = false, waitqueue = [];

  var ws = null;
  var defaults =
  {
    host: "localhost",
    port: 8080
  };  
  var params = defaults;

  var uri = "ws://" + defaults.host + ":" + defaults.port + "/";
  var output = null;

  // clean the event to fit it through web socket
  clean_event = function(ev) {
    var cl = {}; 
    cl.target = ev.target.id;
    cl.delegateTarget = ev.delegateTarget.id;
    cl.currentTarget = ev.currentTarget.id;
    var cps = [ "timeStamp", "type", "bubbles", "cancelable" ];
    if (ev.type.substring(0, 3)=="key")
      cps = cps.concat(["char", "key", "charCode", "keyCode", "which", "location", "repeat", "locale", "ctrlKey", "shiftKey", "altKey", "metaKey" ]);
    else if (ev.type.substring(0, 5)=="mouse")
      cps = cps.concat([ "detail", "screenX", "screenY", "clientX", "clientY", "button", "buttons", "mozPressure", "ctrlKey", "shiftKey", "altKey", "metaKey" ]);
    for(var i=0;i<cps.length; i++) {
      cp = cps[i];
      cl[cp] = ev[cp];
    }
    return cl;
  }

  // http://stackoverflow.com/questions/3417139/how-do-i-calculate-the-height-of-toolbars-address-bars-and-other-navigation-too/3417992#3417992
  get_scrollbar_size = function() {
     var inner = $('<p></p>').css({
        'width':'100%',
        'height':'100%'
     });
     var outer = $('<div></div>').css({
        'position':'absolute',
        'width':'100px',
        'height':'100px',
        'top':'0',
        'left':'0',
        'visibility':'hidden',
        'overflow':'hidden'
     }).append(inner);

     $(document.body).append(outer);

     var w1 = inner.width(), h1 = inner.height();
     outer.css('overflow','scroll');
     var w2 = inner.width(), h2 = inner.height();
     if (w1 == w2 && outer[0].clientWidth) {
        w2 = outer[0].clientWidth;
     }
     if (h1 == h2 && outer[0].clientHeight) {
        h2 = outer[0].clientHeight;
     }

     outer.detach();

     return [(w1 - w2),(h1 - h2)];
  }


  // =========================
  // APP
  // =========================

  function App(name, ctx) {
    this.name = name;
    this.areas = {};
    this.obj = ctx;
  }

  App.prototype.register_area = function(mess) {
    var n = mess.name, w = mess.w, h = mess.h;
    var x = mess.x, y = mess.y;
    var deco = " " + mess.decorator;
    var aclass = "";
    if (mess.aclass)
      aclass = " " + mess.aclass;
    var html = '<div id="area_'+n+'" class="area'+deco+aclass+'" style="top:'+y+'px;left:'+x+'px;width:'+w+'px;height:'+h+'px;"></div>';
    this.obj.append(html);
    this.areas[n] = {w:w, h:h, decorator:deco};
  }

  App.prototype.unregister_area = function(mess) {
    var n = mess.name;
    $("#area_"+n).hide().remove();
    delete(this.areas[n]);
    $.each( widgets, function(nm, w) {
      if (w.area==n)
        delete widgets[nm];
    });
  }

  App.prototype.refresh_area = function(mess) {
    var n = mess.name;
    $("#area_"+n).html("");
    $.each( widgets, function(nm, w) {
      if (w.area==n)
        delete widgets[nm];
    });
  }

  // =========================
  // WIDGET
  // =========================

  // name : name of the widget
  // conn = list of stubs implemented by widget, defaults to stubs
  function Widget(name, conn) {
    if (conn == undefined)
      conn = stubs;
    this.name = name;
    // callbacks to be executed when the widget is displayed
    this.displayed = $.Deferred(); 
    // callback for data
    this.get_data = null;

    this.area = null;

    // proxy store local javascript objects which can be
    // directly user with apply_method and assign_value
    this.proxys = {};
  }

  Widget.prototype.proxy_register = function(proxy_name, mess) {
    // must be defined in sub classes when desired
    // see canva implementation
    // this.proxys[proxy_name] = ...
  }

  Widget.prototype.proxy_apply_method = function(proxy_name, fn, args) {
    var proxy = this.proxys[proxy_name];
    if (proxy && (typeof proxy[fn] === "function"))
      proxy[fn].apply(proxy, args);
  }

  Widget.prototype.proxy_assign_value = function(proxy_name, field, val) {
    if (proxy = this.proxys[proxy_name])
      proxy[field] = val;
  }

  Widget.prototype.display = function(mess) {}
  Widget.prototype.end_display = function(mess, html) {
    var refpos = "area_"+mess.area;
    if (mess.refpos!=undefined)
      refpos = mess.refpos;
    $("#"+refpos).append(html);
    this.area = mess.area;       
    this.displayed.resolve(this);
  }

  Widget.prototype.refresh = function(mess) {}

  Widget.prototype.get_box = function(mess) {
    var st = "";
    if (mess.w != undefined)
      st += "width:" + mess.w + "px;";
    if (mess.h != undefined)
      st += "height:" + mess.h + "px;";
    return st;
  }

  // register one event (if server initialized a callback)
  Widget.prototype.register_event = function(ev) {
    var obj = $("#"+this.name);
    obj.off(ev+".widgsock").on(ev+".widgsock", this[ev].clt);
  }

  // register "stubs" with server
  var stubs = { focus:"simple", blur:"simple", focusin:"simple", focusout:"simple", change:"change", click:"simple", dblclick: "simple", keydown:"simple", keyup:"simple", mousedown:"simple", mouseenter:"simple", mouseleave:"simple", mousemove:"simple", mouseout:"simple", mouseover:"simple", mouseup:"simple", resize:"simple", scroll:"simple", wheel:"simple" };
  for (ev in stubs) {
    (function(f, t) {
      if (t=="simple") {
        Widget.prototype[f] = {
            parent: this,
            srv: function(ev) {
              $("#"+this.name).trigger(f);
            },
            clt: function(ev) {
              var mess = {action:"apply_event", event:f, name:this.name, ev:clean_event(ev)};
              do_send(mess);
            },
            lcl: function(ev) {            
            }
          }
      } else if (t=="change") {
        Widget.prototype[f] = {
            parent: this,
            srv: function(ev) {
              $("#"+this.name).trigger(f);
            },
            clt: function(ev) {
              var val = $(this).val();
              var mess = {action:"apply_event", event:"change" , name:this.name, val: val, ev:clean_event(ev)};
              do_send(mess);
            },
            lcl: function(ev) {            
            }
        }
      };
    }) (ev, stubs[ev]);
  }

  // =========================
  // INPUT WIDGET
  // =========================

  function Input(name)  {
    Widget.call(this, name)
    this.type = "Input";
  }
  Input.prototype = Object.create(Widget.prototype);
  Input.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_input' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<input style='"+this.get_box(mess)+"' type='text' value='"+mess.value+"' name='"+this.name+"' id='"+this.name+"' />";
    html += "</div>";
    this.end_display(mess, html);
  }

  Input.prototype.refresh = function(mess)  {
    var val = mess.value;
    $("#"+this.name).val(val);
  }

  // init the widget with the new val
  Input.prototype.keyup.clt = function(ev) {
    var val = $("#"+this.name).val();
    var mess = {action:"apply_event", event:"keyup", name:this.name, ev:clean_event(ev), val:val};
    do_send(mess);
  }

  // =========================
  // TEXTAREA WIDGET
  // =========================
  function Textarea(name)  {
    Widget.call(this, name)
    this.type = "Textarea";
  }
  Textarea.prototype = Object.create(Widget.prototype);
  Textarea.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_textarea' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<textarea style='"+this.get_box(mess)+"' name='"+this.name+"' id='"+this.name+"'>"+mess.value+"</textarea>";
    html += "</div>";
    this.end_display(mess, html);
  }

  Textarea.prototype.refresh = function(mess)  {
    var val = mess.value;
    $("#"+this.name).val(val);
  }

  // init the widget with the new val
  Textarea.prototype.keyup.clt = function(ev) {
    var val = $("#"+this.name).val();
    var mess = {action:"apply_event", event:"keyup", name:this.name, ev:clean_event(ev), val:val};
    do_send(mess);
  }

  // =========================
  // SELECT WIDGET
  // =========================
  function Select(name)
  {
    Widget.call(this, name);
    this.type = "Select";
  }
  Select.prototype = Object.create(Widget.prototype);
  Select.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y, vsel=mess.value;
    var html = "<div class='widgsock box_select' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<select style='"+this.get_box(mess)+"' name='"+this.name+"' id='"+this.name+"'>";
    $.each(mess.values, function(val, opt) {
      var sel = "";
      if (val==vsel)
        sel = " selected='selected'"
      html += "<option value='"+val+"'"+sel+">"+opt+"</option>";
    });
    html += "</select></div>";
    this.end_display(mess, html);
  }

  Select.prototype.refresh = function(mess)  {
    var sel = mess.value;
    var html = "";
    $("#"+this.name).html("");
    $.each(mess.values, function(val, opt) {
      var ssel = "";
      if (val==sel)
        ssel = " selected='selected'"
      html += "<option value='"+val+"'"+ssel+">"+opt+"</option>";
    });
    $("#"+this.name).html(html);
    
  }

// =========================
  // MULTISELECT WIDGET
  // =========================
  function MultiSelect(name)
  {
    Widget.call(this, name);
    this.type = "MultiSelect";
  }
  MultiSelect.prototype = Object.create(Widget.prototype);
  MultiSelect.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y, vsel=mess.val;
    var html = "<div class='widgsock box_multi_select' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<select multiple='multiple' style='"+this.get_box(mess)+"' name='"+this.name+"' id='"+this.name+"'>";
    var sel = "";
    $.each(mess.values, function(val, opt) {
      sel = "";
      if ($.inArray(val, vsel) != -1)
        sel = " selected='selected'"
      html += "<option value='"+val+"'"+sel+">"+opt+"</option>";
    });
    html += "</select></div>";
    this.end_display(mess, html);
  }

  MultiSelect.prototype.refresh = function(mess)  {
    var vsel = mess.val;
    var html = "";
    $("#"+this.name).html("");
    $.each(mess.values, function(val, opt) {
      var sel = "";
      if ($.inArray(val, vsel) != -1)
        sel = " selected='selected'"
      html += "<option value='"+val+"'"+ssel+">"+opt+"</option>";
    });
    $("#"+this.name).html(html);
    
  }

  // =========================
  // TABS WIDGET
  // =========================
  function Tabs(name)
  {
    Widget.call(this, name);
    this.type = "Tabs";
  }

  Tabs.prototype = Object.create(Widget.prototype);

  Tabs.prototype.init_tabs = function(tabname) {
    $("#"+tabname).find(".tab").on("click", function() {
      //console.log("clic "+tabname);
      var id = $(this).attr("id").replace("tab-", "");
      var comp = id.split("-");
      $("."+tabname).hide();
      $("#"+id).parent().show();      
    });
  }

  Tabs.prototype.init_size = function() {
    var el = $("#"+this.name);
    var sp = el.find("span").first();
    if (sp) {
      var h = sp.outerHeight()+1;
      el.find(".box_tab").css("top", h);
    }
  }

  Tabs.prototype.display = function(mess)  {
    var tabname = this.name;
    var l = mess.x, t=mess.y, vsel=mess.val;
    var html = "<div class='widgsock box_tabs' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<div style='"+this.get_box(mess)+"' name='"+tabname+"' id='"+tabname+"' >";
    $.each(mess.tabs, function(key, tab) {
      var name = "tab-"+tabname+"-"+key;
      html += "<span class='tab' id='"+name+"' >"+tab.name+"</span>"
    });
    var disp = "";
    $.each(mess.tabs, function(key, tab) {
      var name = tabname+"-"+key;
      html += "<div class='widgsock "+tabname+" box_tab' style='"+disp+"'><div name='"+name+"' id='"+name+"'></div></div>";
      disp = "display:none;"
    });
    html += "</div>";
    html += "</div>";
    this.end_display(mess, html);
    this.init_size();
    this.init_tabs(tabname);
  }

  // =========================
  // MENU WIDGET
  // =========================
  function Menu(name)
  {
    Widget.call(this, name);
    this.type = "Menu";
  }

  Menu.prototype = Object.create(Widget.prototype);

  Menu.prototype.click = Object.create(Widget.prototype.click);
  Menu.prototype.click.clt = function(ev) {
    var t = $(ev.target);
    if (t.hasClass("menu_item"))
    {
      var name = ev.currentTarget.id;
      var item = ev.target.id.replace(name+"_", "");
      var mess = {action:"apply_event", event:"click", name:name, item:item, ev:clean_event(ev)};
      do_send(mess);
      $(".menu_item_"+name).toggle();
    }
  }

  Menu.prototype.init_size = function() {
    var el = $("#"+this.name);
    var title = el.find(".menu_title").first();
    var wt = title.outerWidth();
    var ht = t = title.outerHeight();
    var wi = wt + Math.floor(0.2*wt);
    $(".menu_item_"+this.name).each(function() {
      var wl = $(this).width();
      if (wl>wi)
        wi = wl;
      $(this).css("top", t);
      t += ht-1;
    });
    $(".menu_item_"+this.name).width(wi)
  }

  Menu.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var box = this.get_box(mess);
    var name = this.name;
    var html = "<div name='"+name+"' id='"+name+"'><div class='widgsock box_menu menu_title menu_track_"+name+"' style='position:absolute;left:"+l+"px;top:"+t+"px;"+box+"' name='"+name+"_title' id='"+name+"_title'>";
    html += mess.title;
    html += "</div>";
    $.each(mess.items, function(item, lib) {
      t += 30;    
      html += "<div class='widgsock box_menu menu_item menu_track_"+name+" menu_item_"+name+"' style='display:none;position:absolute;left:"+l+"px;top:"+t+"px;"+box+"' id='"+name+"_"+item+"'>"+lib+"</div>";
    });
    html += "</div>";
    this.end_display(mess, html);
    this.init_size(); 

    $("#"+name+"_title").on("mouseenter.widgsock", function(ev) {
      var name = ev.currentTarget.id.replace("_title", "");
      $(".menu_item_"+name).toggle();
      if ($(".menu_item_"+name).first().is(":visible")) {
        $(".menu_track_"+name).unbind("mouseout.widgsok").bind("mouseout.widgsok", function(ev){
          $(".menu_item_"+name).toggle();
        });
      }
    });
  }

  // =========================
  // TABLE WIDGET
  // =========================
  function Table(name)
  {
    Widget.call(this, name);
    this.type = "Table";
  }
  Table.prototype = Object.create(Widget.prototype);

  Table.prototype.init_size = function() {
    var el = $("#"+this.name);
    var title = el.find(".title");
    var cont = el.find(".content");

    var tscroll = get_scrollbar_size();
    var w = el.width() - tscroll[0];
    var h = el.height() - title.height();
    title.css("width", w+"px");
    cont.css("height", h+"px");
   }

  Table.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y, vsel=mess.val, infos = mess.infos;
    var html = "<div class='widgsock box_table' style='position:absolute;left:"+l+"px;top:"+t+"px;"+this.get_box(mess)+"' name='"+this.name+"' id='"+this.name+"'>";
    html += this.display_content(mess);
    html += "</div>";
    this.end_display(mess, html);
    this.init_size();
  }

  Table.prototype.display_content = function(mess) {
    var l = mess.x, t=mess.y, vsel=mess.val, infos = mess.infos;
    var html = "", idxcol = 0;
    if (infos.titles)
    {
      html += "<div class='title' style='width:100%;'>";
      $.each(infos.titles, function(idx, col) {
        var w = infos.w[idx];
        html += "<span class='title"+idxcol+"' style='float:left;width:"+w+";'>"+col+"</span>";
        idxcol ++;
      });
      html += "</div>";
    }
    var sel = "";
    html += "<div class='content'>";
    var idxrow = 0;
    $.each(mess.values, function(val, row) {
      idxcol = 0;
      sel = ""; 
     if (val == vsel)
        sel = "selected";
      html += "<div value='"+val+"' class='"+sel+"'>";
      $.each(row, function(idx, col) {
        var w = infos.w[idx];
        html += "<span class='row"+idxrow+" col"+idxcol+"' style='float:left;width:"+w+";'>"+col+"</span>";
        idxcol ++;
      });
      html += "</div>";
      idxrow++;
    });
    html += "</div>";
    return html;
  }

  Table.prototype.refresh = function(mess)  {
    var el = $("#"+this.name);
    if (el) {
      var offs = el.find("div.content").scrollTop();
      console.log(offs);
      var html = this.display_content(mess);
      $("#"+this.name).html("").html(html);
      this.init_size();
      el.find("div.content").scrollTop(offs);
    }
  }

  Table.prototype.click = Object.create(Widget.prototype.click);
  Table.prototype.click.clt = function(ev) {
    var name = ev.currentTarget.id;
    var infos = ev.target.className;
    var val = $(ev.target).parent().attr("value");
    var col = new RegExp("col[0-9]*").exec(infos);
    if (col)
      col = col.join().replace("col", "");
    var row = new RegExp("row[0-9]*").exec(infos);
    if (row)
      row = row.join().replace("row", "");
    var title = new RegExp("title[0-9]*").exec(infos);
    if (title)
      title = title.join().replace("title", "");
    var mess = {action:"apply_event", value:val, col:col, row:row, title:title, event:"click", name:name, ev:clean_event(ev)};
    do_send(mess);
  }

  Table.prototype.dblclick = Object.create(Widget.prototype.dblclick);
  Table.prototype.dblclick.clt = function(ev) {
    var name = ev.currentTarget.id;
    var infos = ev.target.className;
    var col = new RegExp("col[0-9]*").exec(infos);
    if (col)
      col = col.join().replace("col", "");
    var row = new RegExp("row[0-9]*").exec(infos);
    if (row)
      row = row.join().replace("row", "");
    var title = new RegExp("title[0-9]*").exec(infos);
    if (title)
      title = title.join().replace("title", "");
    var mess = {action:"apply_event", col:col, row:row, title:title, event:"dblclick", name:name, ev:clean_event(ev)};
    do_send(mess);
  }

  // =========================
  // BUTTON WIDGET
  // =========================
  function Button(name, label)
  {
    Widget.call(this, name);
    this.type = "Button";
    this.label = label;
  }
  Button.prototype = Object.create(Widget.prototype);
  Button.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_button' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<button style='"+this.get_box(mess)+"' name='" + this.name + "' id='" + this.name + "' type='button'>" + this.label + "</button> ";
    html += "</div>";
    this.end_display(mess, html);
  }

  Button.prototype.refresh = function(mess)  {
    var lab = mess.label;
    $("#"+this.name).html(lab);
  }

  // =========================
  // CANVAS WIDGET
  // =========================  
  function Canvas(name, label)
  {
    Widget.call(this, name);
    this.type = "Canvas";
    this.label = label;
  }
  Canvas.prototype = Object.create(Widget.prototype);
  Canvas.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_canva' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<canvas style='"+this.get_box(mess)+"' name='" + this.name + "' id='" + this.name + "'></canvas> </div>";
    this.end_display(mess, html);
  }

  Canvas.prototype.proxy_register = function(proxy_name, mess)  {
    var el = $("#"+this.name);
    var type = mess.type;
    if (type=="context2d") {
      var obj = el[0].getContext("2d");
      this.proxys[proxy_name] = obj;
    }
  }

  Canvas.prototype.refresh = function(mess)  {
  }

  // =========================
  // FILEUPLOAD WIDGET
  // =========================
  function FileUpload(name, label)
  {
    Widget.call(this, name);
    this.type = "FileUpload";
    this.label = label;
  }

  FileUpload.prototype = Object.create(Widget.prototype);

  FileUpload.prototype.init_button = function() {
    var name = this.name;

     $("#"+name).on("click", function() {
        $("#browse-"+name).click();
      });

      $("#browse-"+name).on("change", function(ev){
        $("#file-form-"+name).submit();
      });

      $("#file-form-"+name).on("submit", function(ev) {
        ev.preventDefault();
        var files = document.getElementById("browse-"+name).files;
        for (var i = 0; i < files.length; i++) {
          (function(f) {
            // Check the file type.
            // if (!f.type.match('image.*')) 
            //   return;
            var reader = new FileReader();  
            reader.onload = function(evt) {
              var res = btoa(evt.target.result);
              var mess = {action:"send_files", name:name, filename:f.name, data:res };
              do_send(mess);
            };
            reader.readAsBinaryString(f);
          }) (files[i]);
        }

      });
  }

  FileUpload.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_fileupload' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<button style='"+this.get_box(mess)+"' name='" + this.name + "' id='" + this.name + "' type='button'>" + this.label + "</button> ";
    html += "<form id='file-form-"+this.name+"' action='#' method='POST' style='display:none;'>";
    html += "<input id='browse-"+this.name+"' type='file' name='files-"+this.name+"' multiple/>";
    html += "<button type='submit' id='upload-button-"+this.name+"'>Upload</button>";
    html += "</form>";
    html += "</div>";
    this.end_display(mess, html);
    this.init_button();
  }

  FileUpload.prototype.refresh = function(mess)  {
    var lab = mess.label;
    $("#"+this.name).html(lab);
  }

  // =========================
  // IFRAME WIDGET
  // =========================
  function Iframe(name, url)
  {
    Widget.call(this, name);
    this.type = "Iframe";
    this.url = url;
  }
  Iframe.prototype = Object.create(Widget.prototype);
  Iframe.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_iframe' style='position:absolute;left:"+l+"px;top:"+t+"px;'>";
    html += "<iframe style='"+this.get_box(mess)+"' name='" + this.name + "' id='" + this.name + "' src='"+this.url+"'></iframe> ";
    html += "</div>";
    this.end_display(mess, html);
  }

  Iframe.prototype.refresh = function(mess)  {
    this.url = mess.url;
    $("#"+this.name).attr("src", this.url);
  }

  // =========================
  // TEXT WIDGET
  // =========================
  function Text(name, label)
  {
    Widget.call(this, name);
    this.type = "Text";
    this.label = label;
  }
  Text.prototype = Object.create(Widget.prototype);
  Text.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var html = "<div class='widgsock box_text' style='position:absolute;left:"+l+"px;top:"+t+"px;"+this.get_box(mess)+"'>";
    html += "<span name='" + this.name + "' id='" + this.name + "'>"+this.label+"</span> ";
    html += "</div>";
    this.end_display(mess, html);
  }

  Text.prototype.refresh = function(mess)  {
    this.label = mess.label;
    $("#"+this.name).html("").html(this.label);
  }

 // =========================
  // IMG WIDGET
  // =========================
  function Img(name, title, src)
  {
    Widget.call(this, name);
    this.type = "Img";
  }
  Img.prototype = Object.create(Widget.prototype);
  Img.prototype.display = function(mess)  {
    var l = mess.x, t=mess.y;
    var title = mess.title;
    //var src = "data:"+mess.mime+";base64,"+mess.src;
    var src = "";
    var html = "<div class='widgsock box_img' style='position:absolute;left:"+l+"px;top:"+t+"px;"+this.get_box(mess)+"'>";
    html += "<img alt='"+title+"' title='"+title+"' name='" + this.name + "' id='" + this.name + "' src='" + src + "' />";
    html += "</div>";
    this.end_display(mess, html);
    var el = $("#"+this.name);

    this.get_data = $.Deferred(); 
    this.get_data.done( function(data) {
      console.log(el);
      el.attr("src", data);
    });
    var mess = {action:"get_data", which:"src", name:this.name };
    do_send(mess);
  }

  Img.prototype.refresh = function(mess)  {
    this.label = mess.label;
    $("#"+this.name).html("").html(this.label);
  }


  // =========================
  // register websocket
  // =========================
  if (ws==null)
  {
    ws = new WebSocket(uri);
    ws.mod = this;

    ws.onopen = function(evt) { 
      var mess = {action:"connect"};
      connected = true;
      do_send(mess);
      while (mess = waitqueue.pop())
    	    do_send_json(mess);
    };

    ws.onclose = function(evt) {
      var mess = {action:"disconnect"};
      do_send(mess);
    };
      
    ws.onmessage = function(evt) {
      var mess = $.parseJSON(evt.data);
      //console.log(mess.action+" "+mess.type+" "+mess.name);

      if (mess.action=="new") {
        var w = null;
        switch(mess.type)
        {
          case "Select":
            var w = new Select(mess.name);
            break;
          case "MultiSelect":
            var w = new MultiSelect(mess.name);
            break;
          case "Input":
            var w = new Input(mess.name);
            break;
          case "Button":
            var w = new Button(mess.name, mess.label);
            break;
          case "Canvas":
            var w = new Canvas(mess.name);
            break;
          case "Iframe":
            var w = new Iframe(mess.name, mess.url);
            break;
          case "Text":
            var w = new Text(mess.name, mess.label);
            break;  
          case "Textarea":
            var w = new Textarea(mess.name);
            break;
          case "Table":
            var w = new Table(mess.name);
            break;
          case "Menu":
            var w = new Menu(mess.name);
            break;
          case "Img":
            var w = new Img(mess.name);
            break;
          case "Tabs":
            var w = new Tabs(mess.name);
            break;
          case "FileUpload":
            var w = new FileUpload(mess.name, mess.label);
            break;
         }        
         if (w) {
            widgets[mess.name] = w; 
          }
      }

      if (mess.action=="display") {
        widgets[mess.name].display(mess);
      }

      if (mess.action=="refresh") {
        widgets[mess.name].refresh(mess);
      }

      if (mess.action=="register_event") {
        // push the register_event onto the displayed deferred
        widgets[mess.name].displayed.done( function(widg) {
          widg.register_event(mess.event); 
        });
      }

      if (mess.action=="apply_event") {
        var w = widgets[mess.name];
        w[mess.event].srv.apply(w, mess);
        // call local treatment
        w[mess.event].lcl.apply(w, mess);
      }

      if (mess.action=="proxy_new") {
        if (w = widgets[mess.name]) {
          var name = mess.proxy_name;
          w.proxy_register(name, mess);
        }
      }

      if (mess.action=="proxy_apply_method") {
        if (w = widgets[mess.name]) {
          var name = mess.proxy_name;
          var fn = mess.proxy_function;
          var args = mess.proxy_args;
          w.proxy_apply_method(name, fn, args);
        }
      }

      if (mess.action=="proxy_assign_value") {
        if (w = widgets[mess.name]) {
          var name = mess.proxy_name;
          var field = mess.proxy_field;
          var val = mess.proxy_value;
          w.proxy_assign_value(name, field, val);
        }
      }

      if (mess.action=="register_area") {
        apps[mess.app].register_area(mess);
      }

      if (mess.action=="unregister_area") {
        apps[mess.app].unregister_area(mess);
      }

      if (mess.action=="refresh_area") {
        apps[mess.app].refresh_area(mess); 
      }

      if (mess.action=="error") {
        alert(mess.message);
        window.location.reload();
      }

      if (mess.action=="data") {
        var w = widgets[mess.name];
        if (w && w.get_data) {
          w.get_data.resolve(mess.data);
        }
      }

    };

    ws.onerror = function(evt) {
	$.each(apps, function(name, app) {
	    $("#"+app.name).html("<p style='color:red;'>Error '"+name+"' app : cannot connect to server "+params.host+", "+params.port+"  !</p>");
	});
    };

    ws.onping = function(evt) {
    };
  }

  function do_send(obj) {
    mess = JSON.stringify(obj);
    do_send_json(mess);
  }

  function do_send_json(mess) {
    if (connected)
      ws.send(mess);          
    else 
	     waitqueue.push(mess);
  }

  // configuration
  exports.config = function(options) {
    params = $.extend({}, defaults, options); 
    uri = "ws://" + params.host + ":" + params.port + "/";
    output = null;
  }

  exports.run = function (name) {
    var obj = $("#"+name);
    var app = new App(name, obj);
    apps[name] = app;
    var w = obj.css("width"), h = obj.css("height");
    var mess = {action:"run", name:name, w:w, h:h};
    do_send(mess);
  };

}) (this.widgsock = {}) ;

