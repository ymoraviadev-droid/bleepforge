@tool
extends EditorPlugin

# Bleepforge plugin — v0.2.6 Phase 1 scaffolding.
#
# This GDScript stub exists so the plugin loads cleanly into Godot when
# enabled, even though no functionality has shipped yet. Phase 2 swaps this
# for a C# EditorPlugin that registers the manifest emitter and the
# registry base classes.
#
# Why GDScript for Phase 1: a C# script in addons/ requires the Godot
# project's csproj to know about it, which means the plugin can only be
# tested in a project with a configured C# build. GDScript loads
# unconditionally, so the scaffolded plugin works in any Godot 4 install
# from frame one. Phase 2 replaces this file (or sits alongside it) once
# the C# tier 1 lands.

func _enter_tree() -> void:
	# Phase 2 will register the manifest emitter, hook editor-load auto-export
	# of bleepforge_manifest.json at the project root, and add the manual
	# "Re-export Bleepforge manifest" tool menu item.
	pass

func _exit_tree() -> void:
	# Mirror of _enter_tree; clean up registrations the plugin added.
	pass
